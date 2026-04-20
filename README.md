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

- The "recommended for you" section totally doesn't work

- Use the profile pic from the current page while waiting for data to load, but then use the pic from the loaded profile (connected to the "recommended for you" problem)

- Figure out how to publish this on the chrome store

- Write a post on linkedIn about this

- LinkedIn supported this behavior for people and companies. Also add this behavior for companies

- log installs and connections to database

- Fix connection info, only ever shows "connected"