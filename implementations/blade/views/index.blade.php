<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Todo List - Blade.php</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="todo-app" id="app">
        <div class="todo-header">
            <h1>Todo List</h1>
            <span class="framework-badge">Blade.php</span>
        </div>

        <div class="todo-input-container">
            <input
                type="text"
                class="todo-input"
                id="todo-input"
                placeholder="What needs to be done?"
                aria-label="New todo input"
            />
            <button
                class="btn btn-primary"
                onclick="addTodo()"
                aria-label="Add todo"
            >
                Add
            </button>
        </div>

        <div class="todo-filters">
            <button
                class="btn filter-btn active"
                onclick="setFilter('all')"
                data-filter="all"
                aria-label="Show all todos"
            >
                All
            </button>
            <button
                class="btn filter-btn"
                onclick="setFilter('active')"
                data-filter="active"
                aria-label="Show active todos"
            >
                Active
            </button>
            <button
                class="btn filter-btn"
                onclick="setFilter('completed')"
                data-filter="completed"
                aria-label="Show completed todos"
            >
                Completed
            </button>
            <button
                class="btn todo-toggle-all"
                onclick="toggleAll()"
                aria-label="Toggle all todos"
            >
                Toggle all
            </button>
        </div>

        <div class="todo-stats" id="todo-stats">
            <span id="remaining-count">{{ collect($todos)->where('completed', false)->count() }}</span> items remaining
        </div>

        <div id="todo-list-container">
            @if (count($todos) === 0)
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <div class="empty-state-text">No todos to display</div>
                </div>
            @else
                <ul class="todo-list" id="todo-list">
                    @foreach ($todos as $todo)
                        <li class="todo-item {{ $todo['completed'] ? 'completed' : '' }}">
                            <input
                                type="checkbox"
                                class="todo-checkbox"
                                {{ $todo['completed'] ? 'checked' : '' }}
                                onchange="toggleTodo({{ $todo['id'] }})"
                                aria-label="Toggle {{ $todo['text'] }}"
                            />
                            <span class="todo-text">{{ $todo['text'] }}</span>
                            <button
                                class="btn btn-delete"
                                onclick="deleteTodo({{ $todo['id'] }})"
                                aria-label="Delete {{ $todo['text'] }}"
                            >
                                Delete
                            </button>
                        </li>
                    @endforeach
                </ul>
            @endif
        </div>

        <div class="todo-footer">
            Frontend Benchmark - Blade.php Implementation
        </div>
    </div>

    <script>
        // Todo state
        // Hydrate from server-rendered state
        let todos = @json($todos);
        let currentFilter = 'all';
        let nextId = {{ count($todos) + 1 }};

        // Add new todo
        function addTodo() {
            const input = document.getElementById('todo-input');
            const text = input.value.trim();

            if (text === '') return;

            const newTodo = {
                id: nextId++,
                text: text,
                completed: false
            };

            todos.unshift(newTodo);
            input.value = '';
            render();
        }

        // Toggle todo completion
        function toggleTodo(id) {
            const todo = todos.find(t => t.id === id);
            if (todo) {
                todo.completed = !todo.completed;
                render();
            }
        }

        // Delete todo
        function deleteTodo(id) {
            todos = todos.filter(t => t.id !== id);
            render();
        }

        // Toggle every todo: if all are complete, clear them; otherwise complete them all.
        function toggleAll() {
            const allCompleted = todos.length > 0 && todos.every(t => t.completed);
            todos = todos.map(t => ({ ...t, completed: !allCompleted }));
            render();
        }

        // Set filter
        function setFilter(filter) {
            currentFilter = filter;

            // Update button states
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.filter === filter) {
                    btn.classList.add('active');
                }
            });

            render();
        }

        // Get filtered todos
        function getFilteredTodos() {
            switch (currentFilter) {
                case 'active':
                    return todos.filter(t => !t.completed);
                case 'completed':
                    return todos.filter(t => t.completed);
                default:
                    return todos;
            }
        }

        // Get remaining count
        function getRemainingCount() {
            return todos.filter(t => !t.completed).length;
        }

        // Render todos
        function render() {
            const filteredTodos = getFilteredTodos();
            const remainingCount = getRemainingCount();
            const container = document.getElementById('todo-list-container');
            const statsElement = document.getElementById('todo-stats');

            // Update stats
            statsElement.innerHTML = `<span id="remaining-count">${remainingCount}</span> ${remainingCount === 1 ? 'item' : 'items'} remaining`;

            // Render todos
            if (filteredTodos.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📝</div>
                        <div class="empty-state-text">No todos to display</div>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <ul class="todo-list" id="todo-list">
                        ${filteredTodos.map(todo => `
                            <li class="todo-item ${todo.completed ? 'completed' : ''}">
                                <input
                                    type="checkbox"
                                    class="todo-checkbox"
                                    ${todo.completed ? 'checked' : ''}
                                    onchange="toggleTodo(${todo.id})"
                                    aria-label="Toggle ${todo.text}"
                                />
                                <span class="todo-text">${escapeHtml(todo.text)}</span>
                                <button
                                    class="btn btn-delete"
                                    onclick="deleteTodo(${todo.id})"
                                    aria-label="Delete ${todo.text}"
                                >
                                    Delete
                                </button>
                            </li>
                        `).join('')}
                    </ul>
                `;
            }
        }

        // Escape HTML to prevent XSS
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Handle Enter key
        document.addEventListener('DOMContentLoaded', function() {
            const input = document.getElementById('todo-input');
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    addTodo();
                }
            });

            // Note: No initTodos() call needed as state is pre-rendered and hydrated
        });
    </script>
</body>
</html>
