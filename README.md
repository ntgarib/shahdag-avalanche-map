# Şahdüzü Winter Recreation Map

Can free satellite data show where and when avalanches happen in Shahdag National Park, Azerbaijan? An MSc Earth Observation project using Sentinel-1 radar, Sentinel-2, MODIS snow cover, ERA5-Land weather and the Copernicus DEM, processed in Google Earth Engine with AI-written code.

**Live page:** [add your GitHub Pages link here]

> Planning evidence, not a safety assessment. None of these layers says a slope is safe on any given day. Avalanche danger depends on the current snowpack and weather, and Shahdag has no avalanche forecast yet.

## What's here

| Path | Contents |
| --- | --- |
| `index.html`, `style.css`, `js/` | The web page |
| `web_ready/` | Map images and `page_data.js` (all the data the page shows) |

To view it locally, open `index.html` in a browser (internet needed once for the map library).

## Main findings

- April 2025 storm: 202 radar snow-change patches; controls clean, but agreement between the two radar directions was no better than chance and no debris was visible in Sentinel-2. **Unconfirmed.**
- Mahmud Dere, December 2017: two patches seen from both radar directions 425 m and 762 m from the reported point. **Probable, not confirmed.**
- Free Sentinel-1 radar did not reliably detect avalanches here. The page lists the limits.

## Method

Sentinel-1 change detection (VV and VH both at least 3 dB brighter, Sentinel-2 snow mask, slope and radar-shadow masks) run in Google Earth Engine, checked against a quiet-winter control, a summer control and the second radar direction. Snow season from MODIS 8-day snow cover (2016–2026); weather from ERA5-Land. The Earth Engine scripts and analysis code are kept by the author and are available on request.

## Credits

Contains modified Copernicus Sentinel-1 and Sentinel-2 data (2017–2025), processed in Google Earth Engine. Snow: MODIS MOD10A2 v6.1 (NASA). Weather: ERA5-Land (Copernicus Climate Change Service). Elevation: Copernicus DEM GLO-30, © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA. Routes are personal GPS recordings shown without timestamps.

Code written with AI assistance (Claude, ChatGPT, ELM) and checked by the author.
