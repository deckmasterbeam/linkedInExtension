# LinkedIn profile Chrome Extension

LinkedIn used natively support showing a profile on hover

https://www.linkedin.com/blog/member/product/tuesday-tip-hover-over-people-and-companies-in-your-feed

This in development chrome extension injects profile popups into profile links on LinkedIn. When you attempt to hover over a profile link, a profile popup will appear containing the profile's picture, name, bio, and location. This saves you the need to click through to their profile to see any of this info.

I've always been curious about the degree to which data can be cached on the user's side to save on network traffic. It feels like devs take network requests for granted on data that tends to be mostly static over time. In the spirit of making only what network requests are necessary, this extension caches profile hits for 7 days. Something I was also curious about was caching images on the user's side. So images are also cached in blob storage.

## Loading into Chrome

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode** (toggle, top right)
4. Click **Load unpacked** → select the `dist/` folder

After making changes, run `npm run build` again and click the refresh icon on the extension card in `chrome://extensions`.

## Future Work

1. issue where sometimes data that should be retreivable is not, have claude come up with multiple parsing methods
2. I want the profile fetching function to try again for data it couldn't find
3. Figure out how to publish this on the chrome store
4. Write a post on linkedIn about this
5. LinkedIn supported this behavior for people and companies. Also add this behavior for companies
6. Make an icon