use yew::prelude::*;
use web_sys::HtmlInputElement;

#[derive(Clone, PartialEq)]
struct Todo {
    id: usize,
    text: String,
    completed: bool,
}

#[derive(Clone, PartialEq)]
pub enum Filter {
    All,
    Active,
    Completed,
}

pub enum Msg {
    AddTodo,
    ToggleTodo(usize),
    ToggleAll,
    DeleteTodo(usize),
    UpdateInput(String),
    SetFilter(Filter),
}

pub struct App {
    todos: Vec<Todo>,
    input_value: String,
    filter: Filter,
    next_id: usize,
}

impl Component for App {
    type Message = Msg;
    type Properties = ();

    fn create(_ctx: &Context<Self>) -> Self {
        // Generate 100 initial todos
        let todos: Vec<Todo> = (1..=100)
            .map(|i| Todo {
                id: i,
                text: format!("Todo item {}", i),
                completed: i % 3 == 0,
            })
            .collect();

        Self {
            todos,
            input_value: String::new(),
            filter: Filter::All,
            next_id: 101,
        }
    }

    fn update(&mut self, _ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            Msg::AddTodo => {
                if !self.input_value.trim().is_empty() {
                    self.todos.insert(
                        0,
                        Todo {
                            id: self.next_id,
                            text: self.input_value.clone(),
                            completed: false,
                        },
                    );
                    self.next_id += 1;
                    self.input_value.clear();
                    true
                } else {
                    false
                }
            }
            Msg::ToggleTodo(id) => {
                if let Some(todo) = self.todos.iter_mut().find(|t| t.id == id) {
                    todo.completed = !todo.completed;
                    true
                } else {
                    false
                }
            }
            Msg::ToggleAll => {
                let all_completed = !self.todos.is_empty() && self.todos.iter().all(|t| t.completed);
                for todo in self.todos.iter_mut() {
                    todo.completed = !all_completed;
                }
                true
            }
            Msg::DeleteTodo(id) => {
                self.todos.retain(|t| t.id != id);
                true
            }
            Msg::UpdateInput(value) => {
                self.input_value = value;
                true
            }
            Msg::SetFilter(filter) => {
                self.filter = filter;
                true
            }
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let link = ctx.link();

        let filtered_todos: Vec<&Todo> = self
            .todos
            .iter()
            .filter(|todo| match self.filter {
                Filter::All => true,
                Filter::Active => !todo.completed,
                Filter::Completed => todo.completed,
            })
            .collect();

        let remaining_count = self.todos.iter().filter(|t| !t.completed).count();

        let on_input = link.callback(|e: InputEvent| {
            let input: HtmlInputElement = e.target_unchecked_into();
            Msg::UpdateInput(input.value())
        });

        let on_keypress = {
            let link = link.clone();
            Callback::from(move |e: KeyboardEvent| {
                if e.key() == "Enter" {
                    link.send_message(Msg::AddTodo);
                }
            })
        };

        html! {
            <div class="todo-app">
                <div class="todo-header">
                    <h1>{"Todo List"}</h1>
                    <span class="framework-badge">{"Yew"}</span>
                </div>

                <div class="todo-input-container">
                    <input
                        type="text"
                        class="todo-input"
                        placeholder="What needs to be done?"
                        value={self.input_value.clone()}
                        oninput={on_input}
                        onkeypress={on_keypress}
                        aria-label="New todo input"
                    />
                    <button
                        class="btn btn-primary"
                        onclick={link.callback(|_| Msg::AddTodo)}
                        aria-label="Add todo"
                    >
                        {"Add"}
                    </button>
                </div>

                <div class="todo-filters">
                    <button
                        class={classes!("btn", "filter-btn", if matches!(self.filter, Filter::All) { "active" } else { "" })}
                        onclick={link.callback(|_| Msg::SetFilter(Filter::All))}
                        aria-label="Show all todos"
                    >
                        {"All"}
                    </button>
                    <button
                        class={classes!("btn", "filter-btn", if matches!(self.filter, Filter::Active) { "active" } else { "" })}
                        onclick={link.callback(|_| Msg::SetFilter(Filter::Active))}
                        aria-label="Show active todos"
                    >
                        {"Active"}
                    </button>
                    <button
                        class={classes!("btn", "filter-btn", if matches!(self.filter, Filter::Completed) { "active" } else { "" })}
                        onclick={link.callback(|_| Msg::SetFilter(Filter::Completed))}
                        aria-label="Show completed todos"
                    >
                        {"Completed"}
                    </button>
                    <button
                        class="btn todo-toggle-all"
                        onclick={link.callback(|_| Msg::ToggleAll)}
                        aria-label="Toggle all todos"
                    >
                        {"Toggle all"}
                    </button>
                </div>

                <div class="todo-stats">
                    <span>{remaining_count}</span>{format!(" {} remaining", if remaining_count == 1 { "item" } else { "items" })}
                </div>

                {if filtered_todos.is_empty() {
                    html! {
                        <div class="empty-state">
                            <div class="empty-state-icon">{"📝"}</div>
                            <div class="empty-state-text">{"No todos to display"}</div>
                        </div>
                    }
                } else {
                    html! {
                        <ul class="todo-list">
                            {for filtered_todos.iter().map(|todo| {
                                let id = todo.id;
                                let completed = todo.completed;
                                html! {
                                    <li class={classes!("todo-item", if completed { "completed" } else { "" })}>
                                        <input
                                            type="checkbox"
                                            class="todo-checkbox"
                                            checked={completed}
                                            onchange={link.callback(move |_| Msg::ToggleTodo(id))}
                                            aria-label={format!("Toggle {}", todo.text)}
                                        />
                                        <span class="todo-text">{&todo.text}</span>
                                        <button
                                            class="btn btn-delete"
                                            onclick={link.callback(move |_| Msg::DeleteTodo(id))}
                                            aria-label={format!("Delete {}", todo.text)}
                                        >
                                            {"Delete"}
                                        </button>
                                    </li>
                                }
                            })}
                        </ul>
                    }
                }}

                <div class="todo-footer">
                    {"Frontend Benchmark - Yew Implementation"}
                </div>
            </div>
        }
    }
}

fn main() {
    yew::Renderer::<App>::new().render();
}
