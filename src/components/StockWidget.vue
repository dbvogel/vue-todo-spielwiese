<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

type StockData = {
  symbol: string
  price: number
  change: number
  changePercent: number
  timestamp: string
  lastFetch: number
  history: Array<{
    date: string
    close: number
  }>
}

type AlphaVantageResponse = {
  'Meta Data'?: Record<string, string>
  'Time Series (Daily)'?: Record<string, { '4. close': string }>
  'Error Message'?: string
  'Information'?: string
}

const ALPHA_VANTAGE_KEY = 'demo'
const STORAGE_KEY = 'stock-widget:stocks'
const CACHE_DURATION = 5 * 60 * 1000

const searchSymbol = ref('')
const stocks = ref<StockData[]>([])
const loading = ref(false)
const error = ref('')
const selectedStock = ref<StockData | null>(null)
const chartInstance = ref<Chart | null>(null)
const chartCanvasRef = ref<HTMLCanvasElement | null>(null)
const rateLimitMessage = ref('')

function loadStoredStocks() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      stocks.value = JSON.parse(stored)
    } catch {
      stocks.value = []
    }
  }
}

function saveStocks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stocks.value))
}

async function fetchStockData(symbol: string) {
  const upperSymbol = symbol.toUpperCase().trim()
  if (!upperSymbol) {
    error.value = 'Please enter a stock symbol.'
    return
  }

  const existing = stocks.value.find((s) => s.symbol === upperSymbol)
  if (existing && Date.now() - existing.lastFetch < CACHE_DURATION) {
    selectedStock.value = existing
    renderChart(existing)
    return
  }

  loading.value = true
  error.value = ''
  rateLimitMessage.value = ''

  try {
    const queryParams = new URLSearchParams({
      function: 'TIME_SERIES_DAILY',
      symbol: upperSymbol,
      apikey: ALPHA_VANTAGE_KEY,
      outputsize: 'compact',
    })

    const response = await fetch(
      `https://www.alphavantage.co/query?${queryParams.toString()}`,
    )

    if (!response.ok) {
      throw new Error('Failed to fetch stock data.')
    }

    const data = (await response.json()) as AlphaVantageResponse

    if (data['Error Message']) {
      throw new Error(data['Error Message'])
    }

    if (data['Information']) {
      rateLimitMessage.value = 'Rate limit reached. Please try again in a moment.'
      error.value =
        'Alpha Vantage API rate limit reached. Using demo data instead.'
      renderDemoChart(upperSymbol)
      return
    }

    const timeSeries = data['Time Series (Daily)']
    if (!timeSeries) {
      throw new Error('No data available for this symbol.')
    }

    const dates = Object.keys(timeSeries).sort().slice(-60)
    const history = dates.map((date) => {
      const dayData = timeSeries[date]
      if (!dayData) return null
      return {
        date,
        close: parseFloat(dayData['4. close']),
      }
    }).filter((h) => h !== null) as Array<{ date: string; close: number }>

    if (history.length === 0) {
      throw new Error('No valid price data available.')
    }

    const latestClose = history[history.length - 1]!.close
    const previousClose = history[0]!.close
    const change = latestClose - previousClose
    const changePercent = (change / previousClose) * 100

    const stockData: StockData = {
      symbol: upperSymbol,
      price: latestClose,
      change,
      changePercent,
      timestamp: new Date().toISOString(),
      lastFetch: Date.now(),
      history,
    }

    const existingIndex = stocks.value.findIndex((s) => s.symbol === upperSymbol)
    if (existingIndex >= 0) {
      stocks.value[existingIndex] = stockData
    } else {
      stocks.value.push(stockData)
    }

    saveStocks()
    selectedStock.value = stockData
    renderChart(stockData)
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : 'Unexpected error fetching stock data.'
    error.value = message
  } finally {
    loading.value = false
  }
}

function renderDemoChart(symbol: string) {
  const demoData: StockData = {
    symbol,
    price: 150.25,
    change: 5.75,
    changePercent: 3.98,
    timestamp: new Date().toISOString(),
    lastFetch: Date.now(),
    history: Array.from({ length: 30 }, (_, i) => {
      const date = new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0] || ''
      return {
        date,
        close: 140 + Math.sin(i / 5) * 15 + Math.random() * 10,
      }
    }),
  }
  selectedStock.value = demoData
  renderChart(demoData)
}

function renderChart(data: StockData) {
  if (!chartCanvasRef.value) return

  if (chartInstance.value) {
    chartInstance.value.destroy()
  }

  const ctx = chartCanvasRef.value.getContext('2d')
  if (!ctx) return

  const colors = data.change >= 0 ? { line: '#10a981', fill: 'rgba(16, 169, 129, 0.1)' } : { line: '#ef4444', fill: 'rgba(239, 68, 68, 0.1)' }

  chartInstance.value = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.history.map((h) => h.date),
      datasets: [
        {
          label: `${data.symbol} Price`,
          data: data.history.map((h) => h.close),
          borderColor: colors.line,
          backgroundColor: colors.fill,
          borderWidth: 2.5,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointBackgroundColor: colors.line,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#08284f',
            font: { size: 12, weight: 600 },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: {
            color: 'rgba(18, 67, 137, 0.1)',
          },
          ticks: {
            color: '#3d5d86',
          },
        },
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: '#3d5d86',
            maxTicksLimit: 8,
          },
        },
      },
    },
  })
}

function removeStock(symbol: string) {
  stocks.value = stocks.value.filter((s) => s.symbol !== symbol)
  saveStocks()
  if (selectedStock.value?.symbol === symbol) {
    selectedStock.value = null
  }
}

function handleSubmit() {
  void fetchStockData(searchSymbol.value)
  searchSymbol.value = ''
}

const colorClass = computed(() => {
  if (!selectedStock.value) return ''
  return selectedStock.value.change >= 0 ? 'text-emerald-700' : 'text-rose-700'
})

onMounted(() => {
  loadStoredStocks()
  if (stocks.value.length > 0) {
    const firstStock = stocks.value[0]
    if (firstStock) {
      selectedStock.value = firstStock
      renderChart(firstStock)
    }
  }
})

watch(selectedStock, (newStock) => {
  if (newStock) {
    renderChart(newStock)
  }
})
</script>

<template>
  <section class="stock-card reveal-in" style="animation-delay: 100ms;">
    <div class="stock-headline">
      <p class="eyebrow">Capital Markets</p>
      <h2 class="section-title mb-0">Stock Exchange</h2>
    </div>

    <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div class="flex-1">
        <label for="stock-symbol" class="mb-1 block text-sm font-medium text-slate-700">
          Stock symbol
        </label>
        <input
          id="stock-symbol"
          v-model="searchSymbol"
          @keydown.enter.prevent="handleSubmit"
          type="text"
          placeholder="e.g. AAPL, GOOGL, MSFT"
          class="weather-input"
        >
      </div>

      <button
        type="button"
        @click="handleSubmit"
        :disabled="loading"
        class="weather-button"
      >
        {{ loading ? 'Fetching...' : 'Search' }}
      </button>
    </div>

    <p v-if="error" class="mt-3 text-sm text-rose-700">{{ error }}</p>
    <p v-if="rateLimitMessage" class="mt-2 text-xs text-amber-600">⚠ {{ rateLimitMessage }}</p>

    <div v-if="selectedStock" class="mt-4 grid gap-4 md:grid-cols-3">
      <div class="rounded-lg border border-slate-200 bg-white p-3">
        <p class="text-xs text-slate-600">Symbol</p>
        <p class="mt-1 text-lg font-bold text-slate-900">{{ selectedStock.symbol }}</p>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-3">
        <p class="text-xs text-slate-600">Price</p>
        <p class="mt-1 text-lg font-bold text-slate-900">${{ selectedStock.price.toFixed(2) }}</p>
      </div>
      <div :class="['rounded-lg border border-slate-200 bg-white p-3', colorClass]">
        <p class="text-xs text-slate-600">Change</p>
        <p class="mt-1 text-lg font-bold">{{ selectedStock.change >= 0 ? '+' : '' }}{{ selectedStock.change.toFixed(2) }} ({{ selectedStock.changePercent.toFixed(2) }}%)</p>
      </div>
    </div>

    <div v-if="selectedStock" class="stock-chart-container">
      <canvas ref="chartCanvasRef"></canvas>
    </div>

    <div v-if="stocks.length > 0" class="mt-4 space-y-2 border-t border-slate-200 pt-4">
      <p class="text-xs font-medium uppercase text-slate-600">Watched stocks</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="stock in stocks"
          :key="stock.symbol"
          @click="selectedStock = stock"
          :class="[
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
            selectedStock?.symbol === stock.symbol
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
          ]"
        >
          {{ stock.symbol }}
          <button
            @click.stop="removeStock(stock.symbol)"
            class="text-current hover:opacity-70"
            type="button"
          >
            ✕
          </button>
        </button>
      </div>
    </div>

    <p class="mt-3 text-xs text-slate-600">
      Data from Alpha Vantage. Free tier limited to 5 requests/min. Charts display up to 60 days of history.
    </p>
  </section>
</template>

<style scoped>
.stock-card {
  border: 1px solid var(--card-border);
  border-radius: 20px;
  background: var(--card-bg);
  backdrop-filter: blur(16px);
  box-shadow: 0 14px 38px rgba(7, 46, 97, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72);
  margin-top: 0.95rem;
  margin-bottom: 0.95rem;
  padding: 1.05rem;
}

.stock-headline {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.7rem;
}

.stock-chart-container {
  margin-top: 1rem;
  position: relative;
  height: 280px;
  border-radius: 12px;
  border: 1px solid rgba(37, 100, 181, 0.15);
  background: rgba(255, 255, 255, 0.5);
  padding: 1rem;
}

@media (min-width: 700px) {
  .stock-card {
    border-radius: 22px;
    padding: 1.2rem;
  }

  .stock-chart-container {
    height: 320px;
  }
}
</style>
