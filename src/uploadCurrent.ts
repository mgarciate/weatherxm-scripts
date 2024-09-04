import axios from 'axios';
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

interface WeatherResponse {
    id: string;
    name: string;
    label: string;
    location: {
        lat: number;
        lon: number;
    };
    bat_state: string;
    timezone: string;
    address: string;
    bundle: {
        name: string;
        title: string;
        connectivity: string;
        ws_model: string;
        gw_model: string;
    };
    profile: string;
    relation: string;
    attributes: {
        claimedAt: string;
        firmware: {
            current: string;
            assigned: string;
        };
        hex3: {
            index: string;
            polygon: Array<{ lat: number; lon: number }>;
            center: { lat: number; lon: number };
        };
        hex7: {
            index: string;
            polygon: Array<{ lat: number; lon: number }>;
            center: { lat: number; lon: number };
        };
        isActive: boolean;
        lastWeatherStationActivity: string;
        lastActiveAt: string;
    };
    current_weather: {
        timestamp: string;
        temperature: number;
        humidity: number;
        wind_speed: number;
        wind_gust: number;
        wind_direction: number;
        solar_irradiance: number;
        uv_index: number;
        precipitation: number;
        pressure: number;
        dew_point: number;
        precipitation_accumulated: number;
        feels_like: number;
        icon: string;
    };
    rewards: {
        actual_reward: number;
        total_rewards: number;
    };
}

dotenvConfig({ path: resolve(__dirname, "../.env") });
var token = process.env.WXM_TOKEN;
var refreshToken = process.env.WXM_REFRESH_TOKEN;
const deviceId: string = process.env.WXM_DEVICE_ID!;
const wundergroundStationId: string = process.env.WUNDERGROUND_STATION_ID!;
const wundergroundStationPassword: string = process.env.WUNDERGROUND_STATION_PASSWORD!;

async function fetchWeatherData(): Promise<WeatherResponse | null> {
    const url = `https://api.weatherxm.com/api/v1/me/devices/${deviceId}`;

    try {
        const response = await axios.get<WeatherResponse>(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.data;
    } catch (error: any) {
        console.error('Error fetching weather data:', error.response.status, error.message);
        if (error.response && error.response.status === 401) {
            console.error('Token expired, refreshing token...');
            // Sleep for 10 seconds
            await new Promise(resolve => setTimeout(resolve, 10000));
            try {
                const refreshResponse = await axios.post('https://api.weatherxm.com/api/v1/auth/refresh', {
                    refreshToken: refreshToken
                });
                token = refreshResponse.data.token; // Update tokens
                refreshToken = refreshResponse.data.refreshToken;
                console.log('New token:', token);
                console.log('Token refresh:', refreshToken);
                return await fetchWeatherData();
            } catch (refreshError: any) {
                console.error('Error refreshing token:', refreshError.response.status, refreshError.message);
                return null;
            }
        } else {
            console.error('Error fetching weather data:', error.response.status, error.message);
            return null;
        }
    }
}

function formatDateUtc(dateString: string): string {
    const date = new Date(dateString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function uploadWeatherData(data: WeatherResponse['current_weather']) {
    const url = 'https://weatherstation.wunderground.com/weatherstation/updateweatherstation.php';

    const params = {
        ID: wundergroundStationId,
        PASSWORD: wundergroundStationPassword,
        dateutc: formatDateUtc(data.timestamp), // Format: "yyyy-MM-dd HH:mm:ss"
        tempf: (data.temperature * 9/5) + 32,  // Convert Celsius to Fahrenheit
        dewptf: (data.dew_point * 9/5) + 32,  // Convert Celsius to Fahrenheit
        humidity: data.humidity,
        baromin: data.pressure * 0.02953,  // Convert hPa to inHg
        rainin: data.precipitation * 0.0393701,  // Convert mm/h to in/h
        dailyrainin: data.precipitation_accumulated * 0.0393701,  // Convert mm to in
        windspeedmph: data.wind_speed * 0.621371,  // Convert km/h to mph
        windgustmph: data.wind_gust * 0.621371,  // Convert km/h to mph
        winddir: data.wind_direction,
        UV: data.uv_index,
        solarradiation: data.solar_irradiance,
        action: 'updateraw'
    };

    console.log(`Uploading data for device ${JSON.stringify(params)}...`);

    try {
        const response = await axios.get(url, { params });
        console.log(`Upload response for device ${deviceId}:`, response.data);
    } catch (error: any) {
        console.error(`Error uploading data for device ${deviceId}:`, error.response.status, error.message);
    }
}

async function main() {
    const weatherData = await fetchWeatherData();

    if (weatherData && weatherData.current_weather) {
        await uploadWeatherData(weatherData.current_weather);
    } else {
        console.error('No weather data available to upload.');
    }
}

// execute the main function every 30 seconds
setInterval(main, 30 * 1000);
main();
