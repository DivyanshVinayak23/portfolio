---
title: "Lies, Bytes, and B-Trees - Building Key-Value Database"
description: "My experience building a key-value database from scratch."
publishDate: "8 Apr 2026"
tags: ["database", "b-trees", "cpp", "engineering"]
---

## The Magic (and Curse) of SELECT *

Recently, while exploring language classifications, I came across the terms imperative and declarative programming. I had never really internalized the difference between the two before, but it boils down to this.

Imagine ordering a pizza. In an imperative world, you stand in the kitchen telling the chef exactly how to knead the dough, spread the sauce, and monitor the oven temperature. In a declarative world, you just say, "I want a pepperoni pizza." The chef closes the curtains, gets to work, and 15 minutes later, your food appears. Both pizzas might taste the same (the secret chef's might even arrive faster!), but if you are a bit of a control freak, you can't help but wonder what happened behind the curtain.

SQL is the ultimate declarative language. As developers, we fire off `SELECT * FROM users` and take the magic entirely for granted. The database acts as the chef behind the curtain: data goes in, the computer turns off, it turns back on, and the data is magically still there.

So, I decided to peek inside the kitchen and build my own database engine from scratch in C++.

## Phase -1: Pager? I don't even know her.

The harsh reality of programming is that variables die when the program closes. Whatever we are writing needs to be persistent. Hard drives aren't aware what a "C++ class" is, no matter how beautifully we write our structs, it's going to get lost post shutdown. We need something that could translate all of this into something understandable by hard drive - flat, raw arrays of bytes.

### 4 KB Rule

Here's a fun piece of database trivia: SQLite, PostgreSQL, MySQL — they all slice their database files into fixed-size chunks called Pages. Usually 4KB or 8KB, chosen to match the operating system's virtual memory page size and the physical block size of modern SSDs.

It's one of those rare moments in computer science where everyone looked at each other and said, "Yeah, that seems right," and nobody started a flame war about it.

Aligning myself with the greats of the industry, I too chose 4096 bytes as my page size, but how do I ensure that each and every block is the same size? No overflowing, No underflow. To enforce this, I used C++'s `static_assert` along with manual padding. For example, let's suppose I only have 20 bytes of data. But it still had to occupy a full page, so I padded the remaining 4076 bytes explicitly:

```cpp
#pragma pack(push, 1) // no sneaky auto-padding
struct FileHeader {
    uint32_t magicNumber;    // 4 bytes — DB's signature
    int64_t rootOffset;      // 8 bytes — where the B-Tree's root lives
    int64_t freeListHead;    // 8 bytes — tracks deleted/reusable pages
    char padding[4096 - 20]; // 4076 bytes of "padding"
};
#pragma pack(pop)
```

### Where is my byte?

How do you take a structured C++ object — with its types, its fields, its whole personality — and write it to a flat file that only speaks bytes? You lie to the compiler with `reinterpret_cast`.

The Pager takes the memory address of a struct and tells C++: "Hey, don't think of this as a `BTreeNode`. Think of it as a raw array of 4096 chars." The compiler, trusting and obedient, shrugs and does exactly that. Then we blast those 4096 bytes straight onto disk.

Reading a node back from disk looks like this:

```cpp
void readNode(int64_t pageId, BTreeNode& node) {
    // Page 0 lives at byte 0, Page 1 at byte 4096, Page 2 at byte 8192...
    int64_t offset = pageId * 4096;
    
    fileHandle.seekg(offset, ios::beg); // Move the file cursor to the right spot
    
    // The con: convince C++ this object is just a bag of bytes
    char* rawMemory = reinterpret_cast<char*>(&node);
    fileHandle.read(rawMemory, 4096); // Pour the bytes in
}
```

I am aware this seems extremely cursed, but it is effectively fast.

## Phase - 2: Tesseract-Hallway

With the Pager finished, DB had a place to live. Now it needed a brain.

A B-Tree (specifically a B+ Tree, which DB technically is, as values only live in the leaves) is brilliant because it is shallow and wide. If you want to find a single record among millions, a standard binary tree might force you to make 20 or 30 disk reads. A B-Tree can usually find it in three.

But the math required to keep that tree balanced is notoriously brutal.

### The Fencepost Principal

Before writing a single line of traversal logic, I had to define what a `BTreeNode` actually looks like in memory. And immediately, I ran into one of those rules that sounds obvious once you hear it, but will silently destroy your code if you forget it: the Fencepost Principle.

Picture a wooden fence. One post creates two sides — left and right. Two posts create three sections. A hundred posts create 101 sections. The sections always outnumber the posts by exactly one.

In a B-Tree node, keys are the fence posts and child pointers are the sections. This gives you an iron law:

> **A node with N keys must have exactly N+1 children.**

No exceptions. No wiggle room. Get this wrong and your tree will silently corrupt itself in ways that are spectacular to debug at 2am.

To make this concrete, I think of an internal B-Tree node as a long hallway:
- The keys are signs painted on the wall — "50", "80", "120".
- The child pointers are the doors between the signs.

You're looking for the record with key 65. You walk down the hallway, pass the "50" sign, but stop before the "80" sign. There's a door right between them — you open it, step through, and drop down to the next level of the tree. Repeat until you reach a leaf, where the actual data lives.

Three hops through three hallways, and you've found your record out of a million. B-Trees are genuinely beautiful once you see how they work.

### Fitting the Hallway Into 4KB

Remember the Pager's one rule: everything must fit in exactly 4096 bytes. So before writing any tree logic, I had to figure out exactly how many signs and doors I could paint on the walls of a single hallway.

The math, after accounting for metadata fields like `isLeaf`, `keyCount`, and a pointer back to the parent node, worked out to a maximum of 169 keys per node. Which means 170 child pointers. The fencepost principle, perfectly obeyed.

```cpp
constexpr int BLOCK_SIZE = 4096;
constexpr int MAX_KEYS = 169;

struct BTreeNode {
    bool isLeaf;                           // 1 byte
    int32_t keyCount;                      // 4 bytes
    int64_t parentOffset;                  // 8 bytes

    int64_t keys[MAX_KEYS];                // 169 × 8 = 1352 bytes  ← the signs
    int64_t values[MAX_KEYS];              // 169 × 8 = 1352 bytes  ← the treasure (leaves only)
    int64_t childrenOffsets[MAX_KEYS + 1]; // 170 × 8 = 1360 bytes  ← the doors

    // Total: 4077 bytes. Padding fills the rest up to exactly 4096.
};
```

4077 bytes of structure, 19 bytes of padding, and one perfectly sized hallway.

## Read(dy), set, go

Think of a relay race. Each runner only knows their own leg, they don't know who started the race, they don't know where the finish line is, they just run their segment and pass the baton. The B-Tree traversal works exactly like this. The root node doesn't know where the data lives, it just knows which door to point you toward. That node doesn't know either, so it points you to the next. Each level runs its segment, passes the baton downward, until finally a leaf node crosses the finish line and hands back the value.

Starting at the root (always Page 1), DB loads those 4096 bytes into RAM, scans through the keys until it finds one larger than the target, grabs the corresponding child pointer, and asks the Pager for the next page. Repeat until you hit a leaf. Return the value. Done. Race Over.

The whole traversal is just a loop. A loop and a comparison. After all the work of building the Pager and designing the node layout, `get()` practically wrote itself.

If reading was this elegant, I thought, writing can't be that much harder.

Just like my crypto investments, this too aged like milk.

## Phase 3: The Boss Fight (Cascading Splits)

If finding data in a B-Tree is an elegant relay race, writing data is a high-stakes game of Tetris.

Everything is fine as long as there's empty space. You're slotting pieces in, life is good, the music is calm. But remember the math from Phase 2? `MAX_KEYS = 169`. What happens when you try to stuff the 170th key into a hallway designed for 169?

### Mitosis

When a leaf node hits capacity, it does the only reasonable thing: it splits itself in half, like a cell dividing. Cleanly, surgically, with zero drama — at least in theory.

- **The Left Node (the original):** keeps keys 0 to 83. Stays in its lane.
- **The Right Node (the new arrival):** gets keys 85 to 168, and gets its own brand new 4KB page on disk.
- **The Promoted Key:** that exact middle key — index 84 — doesn't go left or right. It gets kicked upstairs to the parent node, to serve as the new signpost between the two halves.

Think of it like a restaurant that got too crowded. You don't turn people away — you open a second dining room next door and put a sign in the lobby telling everyone which room they belong in.

### Identity lock-in

Taking that middle key and inserting it into the parent sounds simple. It is not simple.

You're working with fixed-size C++ arrays. There's no `.push_back()`. There's no magic resizing. To insert a new key in sorted order, you have to physically slide every larger key one position to the right to make room — like pulling books off a shelf to squeeze in a new one.

But here's where the Fencepost Principle comes back to haunt you. Moving a key also means moving its corresponding child pointer, and the doors array is always one larger than the keys array, so the offsets are different. Forget this for even one line and the whole tree quietly goes insane.

```cpp
// 1. Slide the keys (signs) rightward to make room
for (int j = parentNode.keyCount; j > insertIndex; j--) {
    parentNode.keys[j]   = parentNode.keys[j - 1];
    parentNode.values[j] = parentNode.values[j - 1];
}

// 2. Slide the child pointers (doors) rightward
// The +1 is load-bearing. The doors array is always one bigger than keys.
for (int j = parentNode.keyCount + 1; j > insertIndex + 1; j--) {
    parentNode.childrenOffsets[j] = parentNode.childrenOffsets[j - 1];
}

// 3. Drop the new key and its right-hand door into the gaps
parentNode.keys[insertIndex]                = promotedKey;
parentNode.childrenOffsets[insertIndex + 1] = rightChildPageId;
```

The `+1` has been always correct. I will still never fully trust it.

### Inception

Now for the real boss mechanic.

What if the parent node is also full?

This is Cascading Splits — the moment a B-Tree stops being elegant and starts being a natural disaster. The child splits and promotes a key upward. The parent is full, so it splits too, promoting its middle key to its parent. That grandparent is also full. So it splits. All the way up the tree, like a row of dominoes falling in slow motion.

And if the cascade reaches the very top — if the Root itself is full — something genuinely wild happens. The Root splits, a brand new Root is constructed above it, and the entire tree silently grows one level taller. No data is moved. No records are lost. The tree just... gets bigger.

This is one of the most beautiful properties of B-Trees: unlike almost every other tree structure in computer science, B-Trees grow from the bottom up. The root doesn't grow down — the leaves push up.

To handle this, I used a Split and Retry recursive strategy. When `insertIntoParent` hits a full node, it doesn't panic — it pauses, splits the node, rewires the parent pointers, and then calls itself again on the newly freed space. Clean in concept. Absolutely brutal to debug in practice.

But watching the engine successfully insert 100,000 records, splitting hundreds of nodes, dynamically growing a new root, never dropping a single byte, felt like living a dream.

## "Yes, Chef"

Remember the pizza analogy? "I want a pepperoni pizza" and the chef disappears behind the curtain?

Picking up this challenge a few months ago, I could have sworn this blog would never get written. But here's what I can tell you from the other side: the magic is real — it's just held together by some terrifying `reinterpret_cast`s, a fencepost principle that haunts your dreams, and a `+1` on a child pointer array that is always correct and never fully trustworthy.

Every database you've ever used is just a much older, much more battle-tested version of what was built here. Same ideas. Same cascading splits. Just with decades of people finding all the ways it could go wrong, and quietly fixing them.

---

**You can check out the full source code here:**  
[DivyanshVinayak23/keyValueDatabase](https://github.com/DivyanshVinayak23/keyValueDatabase)
