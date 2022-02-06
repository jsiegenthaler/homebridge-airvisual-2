# homebridge-airvisual-3

Homebridge plugin for the AirVisual API which allows access to outdoor air quality, humidity, and temperature.

It is based on from `homebridge-airvisual-2` with the following improvements:

* API errors are properly trapped and logged
* Deprecated dependencies are replaced (Fetch replaced by Axios)
* All dependencies have ben updated to remove vuneralbilities
* Added logic to infer also PM10 density based on AQI (free API plan only)
* Improvements to logging

## Installation

1. Install homebridge using the instructions at https://github.com/nfarina/homebridge#installation
2. Install this plugin using: `npm install -g homebridge-airvisual-3`
3. Register for an account and get an API key at https://www.airvisual.com/api. NOTE: the API key expires in 348 days after creating it, so you need to renew the key about once a year
4. Update the Homebridge configuration file

## Configuration

Example config.json:

```js
"accessories": [
  {
    "accessory": "AirVisual",
    "name": "AirVisual",
    "api_key": "",
    "sensor": "air_quality",
    "aqi_standard": "us",
    "latitude": ,
    "longitude": ,
    "city": "London",
    "state": "England",
    "country": "UK",
    "ppb_units": ["no2", "o3", "so2"],
    "interval": 30
  }
],
```

## Details

Field | Required | Default | Description
:--- | :---: | :---: | :---
`accessory` | yes | `AirVisual` | Must always be `AirVisual`
`name` | yes | `AirVisual` | Can be specified by user
`api_key` | yes | | Obtain from https://www.airvisual.com/api. Valid for 348 days, after which it needs to be renewed.
`sensor` | no | `air_quality` | Must be `air_quality`, `humidity`, or `temperature`
`aqi_standard` | no | `us` | Only applicable if `sensor` is set to `air_quality`, must be `cn` (for China) or `us` (for United States) 
`latitude` | no | | See [**Location**](#location) notes below
`longitude` | no | | See [**Location**](#location) notes below
`city` | no | | See [**Location**](#location) notes below
`state` | no | | See [**Location**](#location) notes below
`country` | no | | See [**Location**](#location) notes below
`ppb_units` | no | | See [**Units**](#units) notes below
`interval` | no | `30` | Set the polling interval in minutes. If using the free "Community" API, then note that the data is updated only once an hour

## Location

By default, AirVisual will use IP geolocation to determine the nearest station to get data from (no configuration needed).

Alternatively, GPS coordinates (`latitude` and `longitude`) or a specific city (`city`, `state`, and `country`) can be used. If your location has no state, then use GPS coordinates instead.

* GPS coordinates can be found using https://www.latlong.net

  * Coordinates must be entered as numbers, not strings

* A specific city, state, and country can be found using https://www.airvisual.com/world

  * Browse to the desired city

  * Format will be shown as *City > State > Country*

* If both `latitude`, `longitude` and `city`, `state`, `country` are specified; the GPS coordinates will be used.

## Units

If a "Startup" or "Enterprise" API key is used, then AirVisual should return concentration for individual pollutants in units of µg/m3. However, various locations appear to report some pollutants in units of ppb.

These pollutants can be converted to µg/m3, which is required for HomeKit, with the following steps:

1. Use the AirVisual app or website to see the reported units of each pollutant for the desired location.

2. Then use the `ppb_units` configuration option to indicate which pollutants should be converted from ppb to µg/m3.

Only `no2`, `o3`, and `so2` are supported for conversion.

## Miscellaneous

* Homebridge supports multiple instances for accessories; the configuration entry can be duplicated for other locations as desired.

* This plugin supports additional characteristics for air quality sensors if a "Startup" or "Enterprise" API key from AirVisual is used.

* The free tier of the API does not provide particle densities, however this plugin will infer the PM2.5 density based on the AQI according to [this table on the Wikipedia Air quality index page](https://en.wikipedia.org/wiki/Air_quality_index#Computing_the_AQI).
  Note that according to API documentation, a city's AQI is based on the "main pollutant" which may or may not be PM2.5. Upgrade your API plan to get correct pollutant data.

* By default the API is queried once every 30 minutes, which is half of AirVisual's station update frequency of once per hour.

* AQI categories are mapped to HomeKit categories as follows. Note that the Home app will show visual alert cues for categories "Inferior" and "Poor".

  AQI US  | AQI Category                   | HomeKit
  --------|--------------------------------|-----------
  0-50    | Good                           | Excellent
  51-100  | Moderate                       | Good
  101-150 | Unhealthy for Sensitive Groups | Fair
  151-200 | Unhealthy                      | Inferior
  201-300 | Very Unhealthy                 | Poor
  301-500 | Hazardous                      | Poor


* If no AQI data can be obtained from AirVisual for any reason, then the accessory will be set to Status Active = No (visible in the Home app), and Status Fault = General Fault (can be viewed in Sortcuts), with Air Quality set to Unknown.

* Automations can be triggered from the Air Quality level. You can trigger on Rises Above or Drops Below.

## References
This version of the AirVisual plugin was forked from https://github.com/qwtel/homebridge-airvisual-2
