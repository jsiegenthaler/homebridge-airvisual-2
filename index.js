/* eslint-disable no-tabs */
/* eslint-disable object-curly-newline */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-multi-spaces */
/* eslint-disable array-bracket-spacing */
/* eslint-disable camelcase */
/* eslint linebreak-style: ["error", "unix"] */
/* eslint max-classes-per-file: ["error", 1] */
/* eslint spaced-comment: ["error", "always"] */
/* eslint linebreak-style: ["error", "windows"] */
/* eslint max-len: ["error", { "code": 150 }] */


// eslint-disable-next-line max-classes-per-file

'use strict';

const axios = require('axios').default;
const { default: storage, NodeStorageArea } = require('node-kv-storage');

const { name: pkgName, version: firmware, displayName: dispName } = require('./package.json');

const API = 'https://api.airvisual.com';

let Service;
let Characteristic;

class AirVisualAccessory {
  constructor(log, config) {
    this.storage = new NodeStorageArea(pkgName);
    this.log = log;
    this.name = config.name;
    this.key = config.api_key;
    this.sensor = config.sensor || 'air_quality';
    this.addTemperature = config.addTemperature || false;
    this.addHumidity = config.addHumidity || false;
    this.standard = config.aqi_standard || 'us';
    this.latitude = config.latitude;
    this.longitude = config.longitude;
    this.city = config.city;
    this.state = config.state;
    this.country = config.country;
    this.ppb = config.ppb_units;
    this.interval = (config.interval || 15) * 60 * 1000;
    this.currentConditions = {};
    
    if (!this.key) {
      throw new Error('API key not specified');
    }
    if (!(this.disableTemperature && this.disableHumidity && this.disableAirQuality)) {
     // throw new Error('At lease one sensor must be enabled');
    }

    if (!(['air_quality', 'humidity', 'temperature'].indexOf(this.sensor) > -1)) {
      this.log.warn('Unsupported sensor specified, defaulting to air quality');
      this.sensor = 'air_quality';
    }
    if (!(['cn', 'us'].indexOf(this.standard) > -1)) {
      this.log.warn('Unsupported air quality standard specified, defaulting to US');
      this.standard = 'us';
    }

    if (config.interval >= 1000) {
      this.log.warn(`Interval is specified in minutes, using ${Math.floor(config.interval / 1000)} minutes instead.`);
      this.interval = config.interval;
    }

    if ([this.latitude, this.longitude].indexOf(undefined) > -1) {
      if (this.latitude || this.longitude) {
        this.log.warn('Incomplete GPS coordinates specified, defaulting to IP geolocation');
        this.latitude = undefined;
        this.longitude = undefined;
      }
    }
    if ([this.city, this.state, this.country].indexOf(undefined) > -1) {
      if (this.city || this.state || this.country) {
        this.log.warn('Incomplete city specified, defaulting to IP geolocation');
        this.city = undefined;
        this.state = undefined;
        this.country = undefined;
      }
    }
    if (this.ppb) {
      for (let index = 0; index < this.ppb.length; index += 1) {
        if (!(['no2', 'o3', 'so2'].indexOf(this.ppb[index]) > -1)) {
          this.log.warn('Unsupported option specified for PPB units, units will not be converted: %s', this.ppb[index]);
        } else {
          this.log.debug('The following pollutant will be converted from ppb to µg/m3: %s', this.ppb[index]);
        }
      }
    }

    if (this.latitude && this.longitude) {
      this.log.debug('Using specified GPS coordinates: %s°, %s°', this.latitude, this.longitude);
      this.mode = 'gps';
      this.serial = String(this.latitude.toFixed(3) + '°, ' + this.longitude.toFixed(3) + '°');
    } else if (this.city && this.country) {
      this.log.debug('Using specified city: %s, %s, %s', this.city, this.state, this.country);
      this.mode = 'city';
      // must allow for no state: moscow, russia
      // https://www.iqair.com/new-zealand/auckland/auckland-city-centre
      // https://www.iqair.com/russia/moscow
      this.serial = String(this.city + ', ' + this.state + ', ' + this.country);
    } else {
      this.log.debug('Using IP geolocation');
      this.mode = 'ip';
      this.serial = 'IP Geolocation';
    }

    // these settings appear not to be used
    // this.log.debug('Polling is %s', (this.polling) ? 'enabled' : 'disabled');
    // this.log.debug('Save response is %s', (this.save) ? 'enabled' : 'disabled');

    this.getConditions = this.getConditions.bind(this);
    this.servicePolling = this.servicePolling.bind(this);

    this.log.debug('Initialisation complete');
//    this.servicePolling();
		
    // start polling
    this.log('Initiating polling at intervals of %s ms (%s m)', this.interval, Math.round(this.intervale / 1000 / 60));
		setInterval(this.servicePolling.bind(this),this.interval);    

    this.log.warn('Calling initial polling');
    this.servicePolling();
  }

  servicePolling() {
    // poll the AirQuality services
    this.log.warn('servicePolling');
    this.requestAndStoreData().then(this.storage.get(this.name)).then(this.getConditions).then((conditions) => {
    //this.requestAndStoreData().then(this.getConditions).then((conditions) => {
    //this.requestAndStoreData().then(this.getConditions).then((conditions) => {
    //  this.storage.get(this.name).then(this.getConditions).then((conditions) => {
        // update characteristic values only if conditions available
      if (conditions) {
        this.log.warn('servicePolling: conditions supplied, updating accessory');
        switch (this.sensor) {
          case 'humidity':
            this.sensorService
              .getCharacteristic(Characteristic.CurrentRelativeHumidity)
              .updateValue(conditions.humidity);
            break;
          case 'temperature':
            this.sensorService
              .getCharacteristic(Characteristic.CurrentTemperature)
              .updateValue(conditions.temperature);
            break;
          case 'air_quality':
          default:
            this.sensorService
              .getCharacteristic(Characteristic.AirQuality)
              .updateValue(conditions.air_quality);
            // need to add all other characteristics here, if data is returned
            break;
        }
      }
    //  setTimeout(this.servicePolling, this.interval);
    }).catch((err) => this.log.error(err.message));
  }

  getAirQuality(callback) {
    this.log.warn('getAirQuality');
    this.storage.get(this.name).then(this.getConditions).then((conditions) => {
      const air_quality = conditions.air_quality || Characteristic.AirQuality.UNKNOWN; // default Unknown if no data
      this.log.warn('getAirQuality: returning %s', air_quality);
      callback(null, air_quality);
    }).catch((err) => this.log.error(err.message));
  }

  getHumidity(callback) {
    this.log.warn('getHumidity');
    this.storage.get(this.name).then(this.getConditions).then((conditions) => {
      this.log.warn('getHumidity: returning %s', conditions.humidity);
      callback(null, conditions.humidity);
    }).catch((err) => this.log.error(err.message));
  }

  getTemperature(callback) {
    this.log.warn('getTemperature');
    this.storage.get(this.name).then(this.getConditions).then((conditions) => {
      this.log.warn('getTemperature: returning %s', conditions.temperature);
      callback(null, conditions.temperature);
    }).catch((err) => this.log.error(err.message));
  }

  getConditions(data) {
    this.log.warn('getConditions');

    if (data === undefined || data === null) {
      this.log.warn('Warning: no data received, disabling sensor');

      // show sensore as not active and faulty when we have no data
      this.sensorService
        .getCharacteristic(Characteristic.StatusActive)
        .updateValue(false);

      this.sensorService
        .getCharacteristic(Characteristic.StatusFault)
        .updateValue(Characteristic.StatusFault.GENERAL_FAULT);

      return null;
    }

    //this.log.warn('getConditions data', data);
    //this.log.warn('getConditions data.data.location', data.data.location);
    //this.log.warn('getConditions data.data.current', data.data.current);
    const conditions = {};
    const retrievalDate = new Date(data.data.current.weather.ts);
    this.log('%s: %s data retrieved, last updated: %s', data.data.city, dispName, retrievalDate.toLocaleString());
    conditions.aqi = parseFloat(this.standard === 'us' ? data.data.current.pollution.aqius : data.data.current.pollution.aqicn);

    conditions.humidity = parseFloat(data.data.current.weather.hu);
    conditions.pressure = parseFloat(data.data.current.weather.pr);
    conditions.temperature = parseFloat(data.data.current.weather.tp);
    conditions.air_quality = this.convertAirQuality(conditions.aqi);
    if (data.data.name) {
      this.log.debug('Station name: %s', data.data.name);
    }
    if (data.data.local_name) {
      this.log.debug('Local name: %s', data.data.local_name);
    }
    this.log.debug('City: %s', data.data.city);
    this.log.debug('State: %s', data.data.state);
    this.log.debug('Country: %s', data.data.country);
    this.log.debug('Latitude: %s°', data.data.location.coordinates[1]);
    this.log.debug('Longitude: %s°', data.data.location.coordinates[0]);
    this.log('%s: Current temperature: %s°C (%s°F)', data.data.city, conditions.temperature, this.convertTemperature(conditions.temperature));
    this.log('%s: Current humidity: %s%', data.data.city, conditions.humidity);
    this.log('%s: Current pressure: %s mbar', data.data.city, conditions.pressure);

    switch (this.sensor) {
      case 'humidity':
        this.log.debug('%s: Current humidity: %s%', data.data.city, conditions.humidity);
        break;
      case 'temperature':
        this.log.debug('%s: Current temperature: %s°C (%s°F)', data.data.city, conditions.temperature, this.convertTemperature(conditions.temperature));
        break;
      case 'air_quality':
      default:
        this.log('%s: Current air quality index: %s [%s]', data.data.city, conditions.aqi, this.convertAirQualityName(conditions.air_quality));
        this.sensorService
          .getCharacteristic(Characteristic.AirQuality)
          .updateValue(conditions.air_quality);

        if (data.data.current.pollution.n2) {
          conditions.no2 = parseFloat(data.data.current.pollution.n2.conc);
          if (this.ppb && (this.ppb.indexOf('no2') > -1)) {
            this.log.debug('%s: Current nitrogen dioxide density: %sppb', data.data.city, conditions.no2);
            this.conditions.no2 = this.convertPPBtoMicrogram(
              'no2',
              conditions.no2,
              conditions.temperature,
              conditions.pressure
            );
          }
          this.log.debug('%s: Current nitrogen dioxide density: %sµg/m3', data.data.city, conditions.no2);
          this.sensorService
            .getCharacteristic(Characteristic.NitrogenDioxideDensity)
            .updateValue(conditions.no2);
        } else {
          this.sensorService
            .removeCharacteristic(Characteristic.NitrogenDioxideDensity);
        }

        if (data.data.current.pollution.o3) {
          conditions.o3 = parseFloat(data.data.current.pollution.o3.conc);
          if (this.ppb && (this.ppb.indexOf('o3') > -1)) {
            this.log.debug('%s: Current ozone density: %sppb', data.data.city, conditions.o3);
            conditions.o3 = this.convertPPBtoMicrogram(
              'o3',
              conditions.o3,
              conditions.temperature,
              conditions.pressure
            );
          }
          this.log.debug('%s: Current ozone density: %sµg/m3', data.data.city, conditions.o3);
          this.sensorService
            .getCharacteristic(Characteristic.OzoneDensity)
            .updateValue(conditions.o3);
        } else {
          this.sensorService
            .removeCharacteristic(Characteristic.OzoneDensity);
        }

        if (data.data.current.pollution.p2) {
          conditions.pm2_5 = parseFloat(data.data.current.pollution.p2.conc);
          this.log.debug('%s: Current PM2.5 density: %sµg/m3', data.data.city, conditions.pm2_5);
          this.sensorService
            .getCharacteristic(Characteristic.PM2_5Density)
            .updateValue(conditions.pm2_5);
        } else {
          const pm2_5 = this.inferPM2_5(conditions.aqi);
          if (pm2_5) {
            conditions.pm2_5 = pm2_5;
            this.log('%s: Inferred PM2.5 density: %sµg/m3', data.data.city, conditions.pm2_5);
            this.sensorService
              .getCharacteristic(Characteristic.PM2_5Density)
              .updateValue(conditions.pm2_5);
          } else {
            this.sensorService
              .removeCharacteristic(Characteristic.PM2_5Density);
          }
        }

        if (data.data.current.pollution.p1) {
          conditions.pm10 = parseFloat(data.data.current.pollution.p1.conc);
          this.log.debug('%s: Current PM10 density: %sµg/m3', data.data.city, conditions.pm10);
          this.sensorService
            .getCharacteristic(Characteristic.PM10Density)
            .updateValue(conditions.pm10);
        } else {
          const pm10 = this.inferPM10(conditions.aqi);
          if (pm10) {
            conditions.pm10 = pm10;
            this.log('%s: Inferred PM10 density: %sµg/m3 (estimated)', data.data.city, conditions.pm10);
            this.sensorService
              .getCharacteristic(Characteristic.PM10Density)
              .setValue(conditions.pm10);
          } else {
            this.sensorService
              .removeCharacteristic(Characteristic.PM10Density);
          }
        }

        if (data.data.current.pollution.s2) {
          conditions.so2 = parseFloat(data.data.current.pollution.s2.conc);
          if (this.ppb && (this.ppb.indexOf('so2') > -1)) {
            this.log.debug('%s: Current sulphur dioxide density: %sppb', data.data.city, conditions.so2);
            this.conditions.so2 = this.convertPPBtoMicrogram(
              'so2',
              conditions.so2,
              conditions.temperature,
              conditions.pressure
            );
          }
          this.log.debug('%s: Current sulphur dioxide density: %sµg/m3', data.data.city, conditions.so2);
          this.sensorService
            .getCharacteristic(Characteristic.SulphurDioxideDensity)
            .updateValue(conditions.so2);
        } else {
          this.sensorService
            .removeCharacteristic(Characteristic.SulphurDioxideDensity);
        }

        if (data.data.current.pollution.co) {
          conditions.co = parseFloat(data.data.current.pollution.co.conc);
          this.log.debug('%s: Current carbon monoxide level: %smg/m3 (%sµg/m3)', data.data.city, conditions.co, conditions.co * 1000);
          conditions.co = this.convertMilligramToPPM(
            'co',
            conditions.co,
            conditions.temperature,
            conditions.pressure
          );
          this.log.debug('%s: Current carbon monoxide level: %sppm', data.data.city, conditions.co);
          this.sensorService
            .getCharacteristic(Characteristic.CarbonMonoxideLevel)
            .updateValue(conditions.co);
        } else {
          this.sensorService
            .removeCharacteristic(Characteristic.CarbonMonoxideLevel);
        }

        break;
    }

    // set accessory to active
    this.sensorService
      .getCharacteristic(Characteristic.StatusActive)
      .updateValue(true);

    // set accessory to no fault
    this.sensorService
      .getCharacteristic(Characteristic.StatusFault)
      .updateValue(Characteristic.StatusFault.NO_FAULT);

    this.currentConditions = conditions;
    this.log.debug('getConditions: currentConditions', this.currentConditions);
    return conditions;
  }

  getURL() {
    this.log.warn('getURL');
    const { mode, key } = this;
    let url = API 
    switch (mode) {
      case 'city': {
        const { city, state, country } = this;
        // https://api.airvisual.com/v2/city?city=moscow&state=&country=russia&key=84e4db3f-e2d9-474e-a11e-0dc59ea774e0
        let url = API + '/v2/city?city=' + city;
        //return new ParamsURL('/v2/city', { city, state, country, key }, API);
        if (state) {
          url = url + '&state=' + state;
        }
        url = url + '&country=' + country + '&key='+ key;
        return url;
      }
      case 'gps': {
        const { latitude: lat, longitude: lon } = this;
        //return new ParamsURL('/v2/nearest_city', { lat,  lon, key }, API);
        //https://api.airvisual.com/v2/nearest_city?lat=47.47603062&lon=8.76791811&key=84e4db3f-e2d9-474e-a11e-0dc59ea774e0
        return API + '/v2/nearest_city?lat=' + lat + '&lon=' + lon + '&key='+ key;
      }
      case 'ip':
      default:
        //return new ParamsURL('/v2/nearest_city', { key }, API);
        //https://api.airvisual.com/v2/nearest_city?lat=47.47603062&lon=8.76791811&key=84e4db3f-e2d9-474e-a11e-0dc59ea774e0
        return API + '/v2/nearest_city?key='+ key;
    }
  }

  async requestAndStoreData() {
    this.log.warn('requestAndStoreData');
    try {
      const url = this.getURL();
      this.log('Retrieving %s data from: %s', dispName, url);

      axios.get(url)
        .then((response) => {
          //this.log('axios response:', response);
          switch (response.data.status) {
            case 'success':
              this.log('%s data retrieved', dispName);
              this.storage.set(this.name, response.data);
              return response.data;
            default:
              throw Error('Unknown status: %s', response);
          }
        })
        .catch((error) => {
          // turn of sensor and set GeneralFault state
          this.sensorService
            .getCharacteristic(Characteristic.StatusActive)
            .setValue(false);

          this.sensorService
            .getCharacteristic(Characteristic.StatusFault)
            .setValue(Characteristic.StatusFault.GENERAL_FAULT);

          this.log.warn('requestAndStoreData: some error:', error);
          const errMsg = error.response.data.data.message || error.response.status + ' ' + error.response.statusText;
          this.log.warn('%s API Warning: %s', dispName, errMsg);
        });
    } catch (requestError) {
      this.log.warn('requestAndStoreData error trap');

      this.sensorService
        .getCharacteristic(Characteristic.StatusActive)
        .setValue(false);

      this.sensorService
        .getCharacteristic(Characteristic.StatusFault)
        .setValue(Characteristic.StatusFault.GENERAL_FAULT);

      throw Error('Unknown error: %s', requestError);
    }
  }

  convertAirQuality(aqi) {
    let characteristic;
    if (!aqi) {
      characteristic = Characteristic.AirQuality.UNKNOWN;
    } else if (aqi >= 201) {
      characteristic = Characteristic.AirQuality.POOR; // Very unhealthy & Hazardous
    } else if (aqi >= 151) {
      characteristic = Characteristic.AirQuality.INFERIOR; // Unhealthy
    } else if (aqi >= 101) {
      characteristic = Characteristic.AirQuality.FAIR; // Unhealthy for Sensitive Groups
    } else if (aqi >= 51) {
      characteristic = Characteristic.AirQuality.GOOD; // Moderate
    } else if (aqi >= 0) {
      characteristic = Characteristic.AirQuality.EXCELLENT; // Good
    } else {
      characteristic = Characteristic.AirQuality.UNKNOWN;
    }
    return characteristic;
  }

  convertAirQualityName(air_quality) { 
    const air_quality_name = ["UNKNOWN", "EXCELLENT", "GOOD", "FAIR", "INFERIOR", "POOR"];
    return air_quality_name[air_quality];
  }

  // Source: https://en.wikipedia.org/wiki/Air_quality_index#Computing_the_AQI
  inferPM2_5(aqi) { // μg/m3
    if (!aqi) return null;
    const table = [
      [  0,  50,   0.0,  12.0],
      [ 50, 100,  12.0,  35.5],
      [100, 150,  35.5,  55.5],
      [150, 200,  55.5, 150.5],
      [200, 300, 150.5, 250.5],
      [300, 400, 250.5, 350.5],
      [400, 500, 350.5, 500.5],
    ];
    const [aqiLow, aqiHigh, pmLow, pmHigh] = table.find(([l, h]) => aqi >= l && aqi < h);
    return pmLow + (((aqi - aqiLow) * (pmHigh - pmLow)) / (aqiHigh - aqiLow));
  }

  // Source: https://en.wikipedia.org/wiki/Air_quality_index#Computing_the_AQI
  inferPM10(aqi) { // μg/m3
    if (!aqi) return null;
    const table = [
      [  0,  50,   0,  55],
      [ 50, 100,  55, 155],
      [100, 150, 155, 255],
      [150, 200, 255, 355],
      [200, 300, 355, 425],
      [300, 400, 425, 505],
      [400, 500, 505, 605],
    ];
    const [aqiLow, aqiHigh, pmLow, pmHigh] = table.find(([l, h]) => aqi >= l && aqi < h);
    return pmLow + (((aqi - aqiLow) * (pmHigh - pmLow)) / (aqiHigh - aqiLow));
  }

  convertMilligramToPPM(pollutant, milligram, temperature, pressure) {
    let weight;
    switch (pollutant) {
      case 'co':
        weight = 28.01;
        break;
      default:
        weight = 0;
        break;
    }
    return ((milligram * 22.41 * ((temperature + 273) / 273) * (1013 / pressure)) / weight);
  }

  convertPPBtoMicrogram(pollutant, ppb, temperature, pressure) {
    let weight;
    switch (pollutant) {
      case 'no2':
        weight = 46.01;
        break;
      case 'o3':
        weight = 48;
        break;
      case 'so2':
        weight = 64.07;
        break;
      default:
        weight = 0;
        break;
    }
    return Math.round(ppb * (weight / (22.41 * ((temperature + 273) / 273) * (1013 / pressure))));
  }

  convertTemperature(temperature) {
    return (temperature * 1.8) + 32;
  }

  identify(callback) {
    this.log.debug('Identified');
    callback();
  }

  getServices() {
    this.log.warn('getServices called');
    const services = [];

    this.accessoryInformationService = new Service.AccessoryInformation();

    this.accessoryInformationService
      .setCharacteristic(Characteristic.FirmwareRevision, firmware)
      .setCharacteristic(Characteristic.Manufacturer, dispName)
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.SerialNumber, this.serial);

    this.accessoryInformationService
      .setCharacteristic(Characteristic.Identify)
      .on('set', this.identify.bind(this));

    if (this.addTemperature) {
      this.log.warn('addTemperature', this.addTemperature);

    }
    switch (this.sensor) {
      case 'humidity':
        this.model = 'Humidity Sensor';
        this.sensorService = new Service.HumiditySensor();
        this.sensorService
          .getCharacteristic(Characteristic.CurrentRelativeHumidity)
          .on('get', this.getHumidity.bind(this));
        break;
      case 'temperature':
        this.model = 'Temperature Sensor';
        this.sensorService = new Service.TemperatureSensor();
        this.sensorService
          .getCharacteristic(Characteristic.CurrentTemperature)
          .on('get', this.getTemperature.bind(this));
        break;
      case 'air_quality':
      default:
        this.model = 'Air Quality Sensor';
        this.sensorService = new Service.AirQualitySensor();
        this.sensorService
          .getCharacteristic(Characteristic.AirQuality)
          .on('get', this.getAirQuality.bind(this));
        break;
    }

    this.accessoryInformationService
      .setCharacteristic(Characteristic.Model, this.model);

    this.sensorService
      .setCharacteristic(Characteristic.Name, this.name);

    this.sensorService
      .addCharacteristic(Characteristic.StatusActive);

    this.sensorService
      .addCharacteristic(Characteristic.StatusFault);

    services.push(
      this.accessoryInformationService,
      this.sensorService
    );

    return services;
  }
}

module.exports = (homebridge) => {
  global.NODE_KV_STORAGE_DIR = homebridge.user.storagePath();
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  //homebridge.registerAccessory('homebridge-airvisual-3', 'AirVisual', AirVisualAccessory);
  homebridge.registerAccessory(pkgName, dispName, AirVisualAccessory);
};
