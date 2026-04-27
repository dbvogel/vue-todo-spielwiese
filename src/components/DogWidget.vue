<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { dogService } from '../services/dogService'
import type { DogFact } from '@/types/dogApi'; 

//State
const currentFact = ref<string>('')
const isLoading = ref(false)
const error = ref<string | null>(null)

//Fetch a random fact
async function fetchRandomFact() {
    isLoading.value = true
    error.value = null
    try {
        currentFact.value = await dogService.getRandomFact()
    } catch (err) {
        error.value = "Failed to load Dog Fact. Try again!"

    } finally {
        isLoading.value = false 
    }
}

onMounted(() => {
    fetchRandomFact()
})
</script>

<template>
  <section class="tile dog-widget-tile reveal-in" style="animation-delay: 200ms;">
    <h2 class="section-title-compact">🐕 Dog Facts</h2>

    <div v-if="isLoading" class="text-xs text-slate-500 py-3">
      Loading fact...
    </div>

    <div v-else-if="error" class="text-xs text-red-600 py-3">
      {{ error }}
    </div>

    <p v-else class="text-xs leading-relaxed text-slate-800 py-3 min-h-12">
      {{ currentFact }}
    </p>

    <button
      @click="fetchRandomFact"
      :disabled="isLoading"
      class="primary-cta-compact mt-2 w-full"
    >
      {{ isLoading ? 'Loading...' : 'New Fact' }}
    </button>
  </section>
</template>