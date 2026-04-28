export interface DogFact {
    id: string,
    type: 'fact',
    attributes: {
        body: string
        }
    }

export interface DogBreed {
    id: string,
    type: 'breed',
    attributes: {
        name: string,
        description: string,
        life_span?: string,
    }
}

export interface DogGroup {
    id: string,
    type: 'group',
    attributes: {
        name: string
    }
}
export interface ApiResponse<T> {
    data: T[]
}
