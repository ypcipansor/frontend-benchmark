import { useState, useMemo } from 'react';
import './App.css';

// Generate initial todos
const generateInitialTodos = (count) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    text: `Todo item ${i + 1}`,
    completed: (i + 1) % 3 === 0, // Every 3rd item (3, 6, 9, ...) is completed
  }));
};

function App() {
  const [todos, setTodos] = useState(() => generateInitialTodos(100));
  const [inputValue, setInputValue] = useState('');
  const [filter, setFilter] = useState('all'); // all, active, completed

  // Add new todo
  const addTodo = () => {
    if (inputValue.trim() === '') return;
    
    const newTodo = {
      id: Date.now(),
      text: inputValue,
      completed: false,
    };
    
    setTodos([newTodo, ...todos]);
    setInputValue('');
  };

  // Toggle todo completion
  const toggleTodo = (id) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  // Delete todo
  const deleteTodo = (id) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  // Toggle every todo: if all are complete, clear them; otherwise complete them all.
  const toggleAll = () => {
    const allCompleted = todos.length > 0 && todos.every(todo => todo.completed);
    setTodos(todos.map(todo => ({ ...todo, completed: !allCompleted })));
  };

  // Filter todos
  const filteredTodos = useMemo(() => {
    switch (filter) {
      case 'active':
        return todos.filter(todo => !todo.completed);
      case 'completed':
        return todos.filter(todo => todo.completed);
      default:
        return todos;
    }
  }, [todos, filter]);

  // Count remaining todos
  const remainingCount = useMemo(() => 
    todos.filter(todo => !todo.completed).length,
    [todos]
  );

  // Handle Enter key
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      addTodo();
    }
  };

  return (
    <div className="todo-app">
      <div className="todo-header">
        <h1>Todo List</h1>
        <span className="framework-badge">React</span>
      </div>

      <div className="todo-input-container">
        <input
          type="text"
          className="todo-input"
          placeholder="What needs to be done?"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          aria-label="New todo input"
        />
        <button 
          className="btn btn-primary" 
          onClick={addTodo}
          aria-label="Add todo"
        >
          Add
        </button>
      </div>

      <div className="todo-filters">
        <button
          className={`btn filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
          aria-label="Show all todos"
        >
          All
        </button>
        <button
          className={`btn filter-btn ${filter === 'active' ? 'active' : ''}`}
          onClick={() => setFilter('active')}
          aria-label="Show active todos"
        >
          Active
        </button>
        <button
          className={`btn filter-btn ${filter === 'completed' ? 'active' : ''}`}
          onClick={() => setFilter('completed')}
          aria-label="Show completed todos"
        >
          Completed
        </button>
        <button
          className="btn todo-toggle-all"
          onClick={toggleAll}
          aria-label="Toggle all todos"
        >
          Toggle all
        </button>
      </div>

      <div className="todo-stats">
        <span>{remainingCount}</span>{` ${remainingCount === 1 ? 'item' : 'items'} remaining`}
      </div>

      {filteredTodos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <div className="empty-state-text">No todos to display</div>
        </div>
      ) : (
        <ul className="todo-list">
          {filteredTodos.map((todo) => (
            <li 
              key={todo.id} 
              className={`todo-item ${todo.completed ? 'completed' : ''}`}
            >
              <input
                type="checkbox"
                className="todo-checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo.id)}
                aria-label={`Toggle ${todo.text}`}
              />
              <span className="todo-text">{todo.text}</span>
              <button
                className="btn btn-delete"
                onClick={() => deleteTodo(todo.id)}
                aria-label={`Delete ${todo.text}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="todo-footer">
        Frontend Benchmark - React Implementation
      </div>
    </div>
  );
}

export default App;
