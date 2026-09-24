use leptos::prelude::*;

#[derive(Clone, PartialEq)]
struct Todo {
    id: usize,
    text: String,
    completed: bool,
}

#[derive(Clone, Copy, PartialEq)]
enum Filter {
    All,
    Active,
    Completed,
}

#[component]
fn App() -> impl IntoView {
    // Generate 100 initial todos
    let initial_todos: Vec<Todo> = (1..=100)
        .map(|i| Todo {
            id: i,
            text: format!("Todo item {}", i),
            completed: i % 3 == 0,
        })
        .collect();

    let (todos, set_todos) = signal(initial_todos);
    let (input_value, set_input_value) = signal(String::new());
    let (filter, set_filter) = signal(Filter::All);
    let (next_id, set_next_id) = signal(101usize);

    // Computed values
    let filtered_todos = move || {
        todos.with(|todos| {
            todos
                .iter()
                .filter(|todo| match filter.get() {
                    Filter::All => true,
                    Filter::Active => !todo.completed,
                    Filter::Completed => todo.completed,
                })
                .cloned()
                .collect::<Vec<_>>()
        })
    };

    let remaining_count = move || todos.with(|todos| todos.iter().filter(|t| !t.completed).count());

    // Actions
    let add_todo = move |_| {
        let text = input_value.get();
        if !text.trim().is_empty() {
            let id = next_id.get();
            set_todos.update(|todos| {
                todos.insert(
                    0,
                    Todo {
                        id,
                        text: text.clone(),
                        completed: false,
                    },
                );
            });
            set_next_id.set(id + 1);
            set_input_value.set(String::new());
        }
    };

    let add_todo_click = move |_| add_todo(());
    let add_todo_keypress = move |ev: web_sys::KeyboardEvent| {
        if ev.key() == "Enter" {
            add_todo(());
        }
    };

    let toggle_todo = move |id: usize| {
        set_todos.update(|todos| {
            if let Some(todo) = todos.iter_mut().find(|t| t.id == id) {
                todo.completed = !todo.completed;
            }
        });
    };

    let delete_todo = move |id: usize| {
        set_todos.update(|todos| {
            todos.retain(|t| t.id != id);
        });
    };

    // Toggle every todo: if all are complete, clear them; otherwise complete them all.
    let toggle_all = move |_| {
        set_todos.update(|todos| {
            let all_completed = !todos.is_empty() && todos.iter().all(|t| t.completed);
            for todo in todos.iter_mut() {
                todo.completed = !all_completed;
            }
        });
    };

    view! {
        <div class="todo-app">
            <div class="todo-header">
                <h1>"Todo List"</h1>
                <span class="framework-badge">"Leptos"</span>
            </div>

            <div class="todo-input-container">
                <input
                    type="text"
                    class="todo-input"
                    placeholder="What needs to be done?"
                    prop:value=move || input_value.get()
                    on:input=move |ev| set_input_value.set(event_target_value(&ev))
                    on:keypress=add_todo_keypress
                    aria-label="New todo input"
                />
                <button
                    class="btn btn-primary"
                    on:click=add_todo_click
                    aria-label="Add todo"
                >
                    "Add"
                </button>
            </div>

            <div class="todo-filters">
                <button
                    class=move || format!("btn filter-btn {}", if filter.get() == Filter::All { "active" } else { "" })
                    on:click=move |_| set_filter.set(Filter::All)
                    aria-label="Show all todos"
                >
                    "All"
                </button>
                <button
                    class=move || format!("btn filter-btn {}", if filter.get() == Filter::Active { "active" } else { "" })
                    on:click=move |_| set_filter.set(Filter::Active)
                    aria-label="Show active todos"
                >
                    "Active"
                </button>
                <button
                    class=move || format!("btn filter-btn {}", if filter.get() == Filter::Completed { "active" } else { "" })
                    on:click=move |_| set_filter.set(Filter::Completed)
                    aria-label="Show completed todos"
                >
                    "Completed"
                </button>
                <button
                    class="btn todo-toggle-all"
                    on:click=toggle_all
                    aria-label="Toggle all todos"
                >
                    "Toggle all"
                </button>
            </div>

            <div class="todo-stats">
                <span>{move || remaining_count()}</span>
                {move || format!(" {} remaining", if remaining_count() == 1 { "item" } else { "items" })}
            </div>

            {move || {
                let todos_list = filtered_todos();
                if todos_list.is_empty() {
                    view! {
                        <div class="empty-state">
                            <div class="empty-state-icon">"📝"</div>
                            <div class="empty-state-text">"No todos to display"</div>
                        </div>
                    }.into_any()
                } else {
                    view! {
                        <ul class="todo-list">
                            <For
                                each=move || filtered_todos()
                                key=|todo| todo.id
                                children=move |todo: Todo| {
                                    let id = todo.id;
                                    let completed = todo.completed;
                                    view! {
                                        <li class=format!("todo-item {}", if completed { "completed" } else { "" })>
                                            <input
                                                type="checkbox"
                                                class="todo-checkbox"
                                                prop:checked=completed
                                                on:change=move |_| toggle_todo(id)
                                                aria-label=format!("Toggle {}", todo.text)
                                            />
                                            <span class="todo-text">{todo.text.clone()}</span>
                                            <button
                                                class="btn btn-delete"
                                                on:click=move |_| delete_todo(id)
                                                aria-label=format!("Delete {}", todo.text)
                                            >
                                                "Delete"
                                            </button>
                                        </li>
                                    }
                                }
                            />
                        </ul>
                    }.into_any()
                }
            }}

            <div class="todo-footer">
                "Frontend Benchmark - Leptos Implementation"
            </div>
        </div>
    }
}

fn main() {
    console_error_panic_hook::set_once();
    mount_to_body(|| view! { <App /> });
}
