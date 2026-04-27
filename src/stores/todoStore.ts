import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useStorage } from '@vueuse/core'

type Priority = 'low' | 'medium' | 'high'

export interface Todo {
    id: number
    text: string
    priority: Priority
    completed: boolean
    createdAt: string
}

export const useTodoStore = defineStore('todo', () => {
    const todos = useStorage<Todo[]>('todos', [], undefined, {
        serializer: {
            read: (value: string): Todo[] => {
                if (!value) return []

                try {
                    const parsed = JSON.parse(value)

                    if (!Array.isArray(parsed)) {
                        return []
                    }

                    return parsed.map((todo, index) => ({
                        id: Number(todo?.id) || index + 1,
                        text: String(todo?.text ?? todo?.content ?? ''),
                        priority: todo?.priority === 'low' || todo?.priority === 'high' ? todo.priority : 'medium',
                        completed: Boolean(todo?.completed),
                        createdAt: todo?.createdAt ?? new Date().toISOString()
                    }))
                } catch {
                    return []
                }
            },
            write: (value: Todo[]) => JSON.stringify(value)
        }
    })

    const nextId = ref(
        todos.value.reduce((maxId, todo) => (todo.id > maxId ? todo.id : maxId), 0) + 1
    )

    const addTodo = (todoText: string, selectedPriority: Priority) => {
        todos.value.push({
            id: nextId.value++,
            text: todoText,
            priority: selectedPriority,
            completed: false,
            createdAt: new Date().toISOString()
        })
    }

    const removeTodo = (id: Todo['id']) => {
        todos.value = todos.value.filter(todo => todo.id !== id)
    }

    const toggleTodo = (id: Todo['id']) => {
        const todo = todos.value.find(t => t.id === id)
        if (todo) {
            todo.completed = !todo.completed
        }
    }

    const completedCount = computed(() =>
        todos.value.filter(todo => todo.completed).length
    )

    const totalCount = computed(() => todos.value.length)

    const pendingCount = computed(() => totalCount.value - completedCount.value)

    const todosByPriority = computed(() => ({
        low: todos.value.filter(todo => todo.priority === 'low').length,
        medium: todos.value.filter(todo => todo.priority === 'medium').length,
        high: todos.value.filter(todo => todo.priority === 'high').length
    }))

    return {
        todos,
        addTodo,
        removeTodo,
        toggleTodo,
        completedCount,
        pendingCount,
        totalCount,
        todosByPriority
    }
})