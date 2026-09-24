#![allow(non_snake_case, unused)]
use dioxus::prelude::*;

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

fn main() {
    dioxus::launch(App);
}

#[component]
fn App() -> Element {
    // Generate 100 initial todos
    let initial_todos: Vec<Todo> = (1..=100)
        .map(|i| Todo {
            id: i,
            text: format!("Todo item {}", i),
            completed: i % 3 == 0,
        })
        .collect();

    let mut todos = use_signal(|| initial_todos);
    let mut input_value = use_signal(String::new);
    let mut filter = use_signal(|| Filter::All);
    let mut next_id = use_signal(|| 101usize);

    // Computed values
    let remaining_count = use_memo(move || {
        todos.read().iter().filter(|t| !t.completed).count()
    });

    let remaining_text = use_memo(move || {
        let count = *remaining_count.read();
        format!(
            " {} remaining",
            if count == 1 { "item" } else { "items" }
        )
    });

    // Computed values
    let filtered_todos = use_memo(move || {
        todos.read().iter().filter(|todo| match *filter.read() {
            Filter::All => true,
            Filter::Active => !todo.completed,
            Filter::Completed => todo.completed,
        })
        .cloned()
        .collect::<Vec<_>>()
    });

    // Actions
    let mut add_todo = move || {
        let text = input_value.read().clone();
        if !text.trim().is_empty() {
            let id = *next_id.read();
            todos.write().insert(
                0,
                Todo {
                    id,
                    text: text.clone(),
                    completed: false,
                },
            );
            *next_id.write() = id + 1;
            *input_value.write() = String::new();
        }
    };

    // Toggle every todo: if all are complete, clear them; otherwise complete them all.
    let mut toggle_all = move || {
        let all_completed = {
            let list = todos.read();
            !list.is_empty() && list.iter().all(|t| t.completed)
        };
        todos.write().iter_mut().for_each(|t| t.completed = !all_completed);
    };

    rsx! {
        div { class: "todo-app",
            div { class: "todo-header",
                h1 { "Todo List" }
                span { class: "framework-badge", "Dioxus" }
            }

            div { class: "todo-input-container",
                input {
                    r#type: "text",
                    class: "todo-input",
                    placeholder: "What needs to be done?",
                    value: "{input_value.read()}",
                    oninput: move |evt| input_value.set(evt.value()),
                    onkeypress: move |evt| {
                        if evt.key() == Key::Enter {
                            add_todo();
                        }
                    },
                    "aria-label": "New todo input"
                }
                button {
                    class: "btn btn-primary",
                    onclick: move |_| add_todo(),
                    "aria-label": "Add todo",
                    "Add"
                }
            }

            div { class: "todo-filters",
                button {
                    class: if *filter.read() == Filter::All { "btn filter-btn active" } else { "btn filter-btn" },
                    onclick: move |_| filter.set(Filter::All),
                    "aria-label": "Show all todos",
                    "All"
                }
                button {
                    class: if *filter.read() == Filter::Active { "btn filter-btn active" } else { "btn filter-btn" },
                    onclick: move |_| filter.set(Filter::Active),
                    "aria-label": "Show active todos",
                    "Active"
                }
                button {
                    class: if *filter.read() == Filter::Completed { "btn filter-btn active" } else { "btn filter-btn" },
                    onclick: move |_| filter.set(Filter::Completed),
                    "aria-label": "Show completed todos",
                    "Completed"
                }
                button {
                    class: "btn todo-toggle-all",
                    onclick: move |_| toggle_all(),
                    "aria-label": "Toggle all todos",
                    "Toggle all"
                }
            }

            div { class: "todo-stats",
                span { "{remaining_count.read()}" }
                "{remaining_text.read()}"
            }

            if filtered_todos.read().is_empty() {
                div { class: "empty-state",
                    div { class: "empty-state-icon", "📝" }
                    div { class: "empty-state-text", "No todos to display" }
                }
            } else {
                ul { class: "todo-list",
                    for todo in filtered_todos.read().clone() {
                        li { 
                            key: "{todo.id}",
                            class: if todo.completed { "todo-item completed" } else { "todo-item" },
                            input {
                                r#type: "checkbox",
                                class: "todo-checkbox",
                                checked: todo.completed,
                                onchange: move |_| {
                                    let id = todo.id;
                                    if let Some(t) = todos.write().iter_mut().find(|t| t.id == id) {
                                        t.completed = !t.completed;
                                    }
                                },
                                "aria-label": "Toggle {todo.text}"
                            }
                            span { class: "todo-text", "{todo.text}" }
                            button {
                                class: "btn btn-delete",
                                onclick: move |_| {
                                    let id = todo.id;
                                    todos.write().retain(|t| t.id != id);
                                },
                                "aria-label": "Delete {todo.text}",
                                "Delete"
                            }
                        }
                    }
                }
            }

            div { class: "todo-footer",
                "Frontend Benchmark - Dioxus Implementation"
            }
        }
    }
}
