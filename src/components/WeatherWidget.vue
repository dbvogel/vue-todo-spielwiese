<script setup lang="ts">
import { onMounted, ref } from 'vue'

type WeatherInfo = {
  locationLabel: string
  temperature: number
  windSpeed: number
  weatherCode: number
  time: string
}

type GeocodingResult = {
  name: string
  country?: string
  admin1?: string
  latitude: number
  longitude: number
}

const STORAGE_KEY = 'weather-widget:last-location'

const areaQuery = ref(localStorage.getItem(STORAGE_KEY) ?? 'Berlin')
const weather = ref<WeatherInfo | null>(null)
const loading = ref(false)
const error = ref('')

function weatherLabelFromCode(code: number): string {
  const labels: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    80: 'Rain showers',
    81: 'Heavy rain showers',
    82: 'Violent rain showers',
    95: 'Thunderstorm',
  }

  return labels[code] ?? 'Unknown conditions'
}

async function fetchWeather() {
  const query = areaQuery.value.trim()
  if (!query) {
    error.value = 'Please enter an area.'
    weather.value = null
    return
  }

  loading.value = true
  error.value = ''

  try {
    const geocodingResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`,
    )

    if (!geocodingResponse.ok) {
      throw new Error('Could not geocode area.')
    }

    const geocodingData = await geocodingResponse.json()
    const topResult = geocodingData?.results?.[0] as GeocodingResult | undefined

    if (!topResult) {
      throw new Error('No matching area found. Try a different name.')
    }

    const forecastResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${topResult.latitude}&longitude=${topResult.longitude}&current=temperature_2m,wind_speed_10m,weather_code&timezone=auto`,
    )

    if (!forecastResponse.ok) {
      throw new Error('Could not load weather data.')
    }

    const forecastData = await forecastResponse.json()
    const current = forecastData?.current

    if (!current) {
      throw new Error('Weather data is unavailable right now.')
    }

    const locationParts = [topResult.name, topResult.admin1, topResult.country].filter(Boolean)

    weather.value = {
      locationLabel: locationParts.join(', '),
      temperature: Number(current.temperature_2m),
      windSpeed: Number(current.wind_speed_10m),
      weatherCode: Number(current.weather_code),
      time: String(current.time),
    }

    localStorage.setItem(STORAGE_KEY, query)
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Unexpected error while fetching weather.'
    error.value = message
    weather.value = null
  } finally {
    loading.value = false
  }
}

function handleSubmit() {
  void fetchWeather()
}

function formattedTime(value: string): string {
  return new Date(value).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  void fetchWeather()
})
</script>

<template>
  <section class="weather-card reveal-in" style="animation-delay: 50ms;">
    <div class="weather-headline">
      <p class="eyebrow">Atmospheric Feed</p>
      <h2 class="section-title mb-0">Weather Scan</h2>
    </div>

    <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div class="flex-1">
        <label for="weather-area" class="mb-1 block text-sm font-medium text-sky-900">
          Scan area
        </label>
        <input
          id="weather-area"
          v-model="areaQuery"
          @keydown.enter.prevent="handleSubmit"
          type="text"
          placeholder="e.g. Berlin, London, Munich"
          class="weather-input"
        >
      </div>

      <button
        type="button"
        @click="handleSubmit"
        :disabled="loading"
        class="weather-button"
      >
        {{ loading ? 'Scanning...' : 'Run scan' }}
      </button>
    </div>

    <p v-if="error" class="mt-3 text-sm text-rose-700">{{ error }}</p>

    <div v-else-if="weather" class="weather-current">
      <p class="text-sm font-medium text-sky-950">{{ weather.locationLabel }}</p>
      <div class="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
        <p class="weather-temp">{{ weather.temperature.toFixed(1) }}°C</p>
        <p class="text-sm text-sky-900">{{ weatherLabelFromCode(weather.weatherCode) }}</p>
        <p class="text-sm text-sky-900">Wind: {{ weather.windSpeed.toFixed(1) }} km/h</p>
      </div>
      <p class="mt-2 text-xs text-sky-800">Updated: {{ formattedTime(weather.time) }}</p>
      <p class="mt-1 text-xs text-sky-800">Data source: Open-Meteo (free API)</p>
    </div>
  </section>
</template>
