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

dotenvConfig({ path: resolve(__dirname, "../secret.env") });
var token = process.env.WXM_TOKEN;
var refreshToken = process.env.WXM_REFRESH_TOKEN;
const username = process.env.WXM_USERNAME;
const password = process.env.WXM_PASSWORD;
const deviceId = process.env.WXM_DEVICE_ID;
const wundergroundStationId = process.env.WUNDERGROUND_STATION_ID;
const wundergroundPassword = process.env.WUNDERGROUND_STATION_PASSWORD;

async function login(): Promise<boolean> {
    try {
        console.log('Attempting to login with username:', username);
        const loginResponse = await axios.post('https://api.weatherxm.com/api/v1/auth/login', {
            username: username,
            password: password
        });

        token = loginResponse.data.token;
        refreshToken = loginResponse.data.refreshToken;
        console.log('Login successful. New token obtained.');
        console.log('New token2:', token);
        console.log('Token refresh2:', refreshToken);
        return true;
    } catch (loginError: any) {
        console.error('Error during login:', loginError.response?.status, loginError.message);
        return false;
    }
}

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
                console.log('New token1:', token);
                console.log('Token refresh1:', refreshToken);
                return await fetchWeatherData();
            } catch (refreshError: any) {
                console.error('Error refreshing token:', refreshError.response?.status, refreshError.message);
                console.log('Attempting to login to get new tokens...');
                
                // Try to login to get new tokens
                const loginSuccess = await login();
                if (loginSuccess) {
                    // Retry fetching weather data with new tokens
                    return await fetchWeatherData();
                } else {
                    console.error('Login failed. Cannot fetch weather data.');
                    return null;
                }
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
        PASSWORD: wundergroundPassword,
        dateutc: formatDateUtc(data.timestamp),
        tempf: (data.temperature * 9/5) + 32,  // Convert Celsius to Fahrenheit
        dewptf: (data.dew_point * 9/5) + 32,  // Assuming dew point is same as temperature
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
    if (!deviceId) {
        console.error('WXM_DEVICE_ID not found in environment variables');
        return;
    }
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
