import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

// Generate initial todos
const generateInitialTodos = (count: number): Todo[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    text: `Todo item ${i + 1}`,
    completed: (i + 1) % 3 === 0, // Every 3rd item (3, 6, 9, ...) is completed
  }));
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected todos = signal<Todo[]>(generateInitialTodos(100));
  protected inputValue = signal('');
  protected filter = signal<'all' | 'active' | 'completed'>('all');

  // Computed properties
  protected filteredTodos = computed(() => {
    const todos = this.todos();
    const filter = this.filter();
    
    switch (filter) {
      case 'active':
        return todos.filter(todo => !todo.completed);
      case 'completed':
        return todos.filter(todo => todo.completed);
      default:
        return todos;
    }
  });

  protected remainingCount = computed(() => 
    this.todos().filter(todo => !todo.completed).length
  );

  // Methods
  addTodo() {
    const text = this.inputValue().trim();
    if (text === '') return;
    
    const newTodo: Todo = {
      id: Date.now(),
      text,
      completed: false,
    };
    
    this.todos.update(todos => [newTodo, ...todos]);
    this.inputValue.set('');
  }

  toggleTodo(id: number) {
    this.todos.update(todos =>
      todos.map(todo =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  }

  deleteTodo(id: number) {
    this.todos.update(todos => todos.filter(todo => todo.id !== id));
  }

  setFilter(filter: 'all' | 'active' | 'completed') {
    this.filter.set(filter);
  }

  handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.addTodo();
    }
  }
}
