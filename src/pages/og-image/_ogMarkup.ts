import { html } from "satori-html";
import { siteConfig } from "@/site.config";

// OG image markup, use https://og-playground.vercel.app/ to design your own.
export const ogMarkup = (title: string, pubDate: string) =>
	html`<div tw="flex flex-col w-full h-full bg-[#1d1f21] text-[#c9cacc]">
		<div tw="flex flex-col flex-1 w-full p-10 justify-center">
			<p tw="text-2xl mb-6">${pubDate}</p>
			<h1 tw="text-6xl font-bold leading-snug text-white">${title}</h1>
		</div>
		<div tw="flex items-center justify-between w-full p-10 border-t border-[#2bbc89] text-xl">
			<div tw="flex items-center">
				<svg height="60" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
					<g fill="#e8a5b2">
						<path d="M25,30c-1.103,0-2-0.897-2-2c0-0.552-0.449-1-1-1s-1,0.448-1,1c0,1.103-0.897,2-2,2s-2-0.897-2-2 c0-0.552-0.449-1-1-1s-1,0.448-1,1c0,1.103-0.897,2-2,2s-2-0.897-2-2c0-0.552-0.449-1-1-1s-1,0.448-1,1c0,1.103-0.897,2-2,2 c-0.276,0-0.5-0.224-0.5-0.5S6.724,29,7,29c0.551,0,1-0.448,1-1c0-1.103,0.897-2,2-2s2,0.897,2,2c0,0.552,0.449,1,1,1s1-0.448,1-1 c0-1.103,0.897-2,2-2s2,0.897,2,2c0,0.552,0.449,1,1,1s1-0.448,1-1c0-1.103,0.897-2,2-2s2,0.897,2,2c0,0.552,0.449,1,1,1 s1-0.448,1-1V13c0-2.705-1.063-5.239-2.994-7.136c-1.93-1.895-4.468-2.896-7.193-2.862C10.402,3.101,6,7.742,6,13.349V26.5 C6,26.776,5.776,27,5.5,27S5,26.776,5,26.5V13.349C5,7.201,9.842,2.11,15.794,2.002c2.999-0.051,5.789,1.063,7.913,3.149 C25.831,7.236,27,10.024,27,13v15C27,29.103,26.103,30,25,30z"/>
						<circle cx="13.5" cy="13.5" r="0.5"/>
						<circle cx="18.5" cy="13.5" r="0.5"/>
					</g>
				</svg>
				<p tw="ml-3 font-semibold">${siteConfig.title}</p>
			</div>
			<p>by ${siteConfig.author}</p>
		</div>
	</div>`;
