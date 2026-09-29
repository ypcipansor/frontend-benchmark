<script setup>
import { ref, computed } from 'vue';

// Generate initial todos
const generateInitialTodos = (count) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    text: `Todo item ${i + 1}`,
    completed: (i + 1) % 3 === 0, // Every 3rd item (3, 6, 9, ...) is completed
  }));
};

const todos = ref(generateInitialTodos(100));
const inputValue = ref('');
const filter = ref('all'); // all, active, completed

// Add new todo
const addTodo = () => {
  if (inputValue.value.trim() === '') return;
  
  const newTodo = {
    id: Date.now(),
    text: inputValue.value,
    completed: false,
  };
  
  todos.value.unshift(newTodo);
  inputValue.value = '';
};

// Toggle todo completion
const toggleTodo = (id) => {
  const todo = todos.value.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
  }
};

// Delete todo
const deleteTodo = (id) => {
  todos.value = todos.value.filter(todo => todo.id !== id);
};

// Toggle every todo: if all are complete, clear them; otherwise complete them all.
const toggleAll = () => {
  const allCompleted = todos.value.length > 0 && todos.value.every(todo => todo.completed);
  todos.value = todos.value.map(todo => ({ ...todo, completed: !allCompleted }));
};

// Filter todos
const filteredTodos = computed(() => {
  switch (filter.value) {
    case 'active':
      return todos.value.filter(todo => !todo.completed);
    case 'completed':
      return todos.value.filter(todo => todo.completed);
    default:
      return todos.value;
  }
});

// Count remaining todos
const remainingCount = computed(() => 
  todos.value.filter(todo => !todo.completed).length
);

// Handle Enter key
const handleKeyPress = (e) => {
  if (e.key === 'Enter') {
    addTodo();
  }
};
</script>

<template>
  <div class="todo-app">
    <div class="todo-header">
      <h1>Todo List</h1>
      <span class="framework-badge">Vue.js</span>
    </div>

    <div class="todo-input-container">
      <input
        type="text"
        class="todo-input"
        placeholder="What needs to be done?"
        v-model="inputValue"
        @keypress="handleKeyPress"
        aria-label="New todo input"
      />
      <button 
        class="btn btn-primary" 
        @click="addTodo"
        aria-label="Add todo"
      >
        Add
      </button>
    </div>

    <div class="todo-filters">
      <button
        :class="['btn', 'filter-btn', { active: filter === 'all' }]"
        @click="filter = 'all'"
        aria-label="Show all todos"
      >
        All
      </button>
      <button
        :class="['btn', 'filter-btn', { active: filter === 'active' }]"
        @click="filter = 'active'"
        aria-label="Show active todos"
      >
        Active
      </button>
      <button
        :class="['btn', 'filter-btn', { active: filter === 'completed' }]"
        @click="filter = 'completed'"
        aria-label="Show completed todos"
      >
        Completed
      </button>
      <button
        class="btn todo-toggle-all"
        @click="toggleAll"
        aria-label="Toggle all todos"
      >
        Toggle all
      </button>
    </div>

    <div class="todo-stats"><span>{{ remainingCount }}</span> {{ remainingCount === 1 ? 'item' : 'items' }} remaining</div>

    <div v-if="filteredTodos.length === 0" class="empty-state">
      <div class="empty-state-icon">📝</div>
      <div class="empty-state-text">No todos to display</div>
    </div>
    <ul v-else class="todo-list">
      <li 
        v-for="todo in filteredTodos" 
        :key="todo.id" 
        :class="['todo-item', { completed: todo.completed }]"
      >
        <input
          type="checkbox"
          class="todo-checkbox"
          :checked="todo.completed"
          @change="toggleTodo(todo.id)"
          :aria-label="`Toggle ${todo.text}`"
        />
        <span class="todo-text">{{ todo.text }}</span>
        <button
          class="btn btn-delete"
          @click="deleteTodo(todo.id)"
          :aria-label="`Delete ${todo.text}`"
        >
          Delete
        </button>
      </li>
    </ul>

    <div class="todo-footer">
      Frontend Benchmark - Vue.js Implementation
    </div>
  </div>
</template>

<style>
@import './style.css';
</style>
