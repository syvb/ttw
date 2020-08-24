<script>
    import TodoList from "./TodoList.svelte";

    let todoState = [
        // TODO: actually load from DB
        {
            id: 1,
            name: "Eat lunch",
            done: false,
            children: [
                {
                    id: 2,
                    name: "Prepare food",
                    children: [
                        {
                            id: 4,
                            name: "Boil water",
                            done: true
                        },
                        {
                            id: 5,
                            name: "Cook pasta",
                            done: false
                        },
                        {
                            id: 6,
                            name: "Cut cheese",
                            done: true,
                        }
                    ]
                },
                {
                    id: 3,
                    name: "Eat food",
                    done: false,
                }
            ]
        }
    ]
</script>

<style>

</style>

<h2>Todo list</h2>

<TodoList todos={todoState} />
