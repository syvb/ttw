<script>
    import Todo from "./Todo.svelte";
    export let todos;
</script>

<ul>
    {#each todos as todo}
        <li>
            <Todo {todo} />
        </li>
    {/each}
</ul>
