import type { ApiResponse, DogBreed, DogFact, DogGroup } from '../types/dogApi'

const API_BASE_URL = 'https://dogapi.dog/api/v2'

export const dogService = {
    async getRandomFact(): Promise<string> {
        try {
        const response = await fetch(`${API_BASE_URL}/facts`)
        if (!response.ok) throw new Error(`API error: ${response.status}`)

        const data: ApiResponse<DogFact> = await response.json()
        return data.data[0]?.attributes.body || 'No fact available.' 
}       catch (error) {
            console.error('Error fetching dog fact:', error)
            throw new Error('Failed to fetch dog fact')
        }
    },
  async getBreeds(page: number = 1, pageSize: number = 10): Promise<DogBreed[]> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/breeds?page[number]=${page}&page[size]=${pageSize}`
      )
      if (!response.ok) throw new Error(`API error: ${response.status}`)
      
      const data: ApiResponse<DogBreed> = await response.json()
      return data.data
    } catch (error) {
      console.error('Failed to fetch breeds:', error)
      throw error
    }
  },

  async getBreedById(id: string): Promise<DogBreed | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/breeds/${id}`)
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`API error: ${response.status}`)
      
      const data: ApiResponse<DogBreed> = await response.json()
      return data.data[0] || null
    } catch (error) {
      console.error(`Failed to fetch breed ${id}:`, error)
      return null
    }
  },

  async getGroups(): Promise<DogGroup[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/groups?page[size]=100`)
      if (!response.ok) throw new Error(`API error: ${response.status}`)
      
      const data: ApiResponse<DogGroup> = await response.json()
      return data.data
    } catch (error) {
      console.error('Failed to fetch groups:', error)
      throw error
    }
  }
}
