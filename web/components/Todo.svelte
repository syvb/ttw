<script>
    import TodoList from "./TodoList.svelte";
    export let todo;

    let checked = todo.done;
</script>

<style>
    /* Be careful when editing the styles, since this component includes itself indirectly */
    .checkbox {
        height: 1.1rem;
        width: 1.1rem;
    }
    .todo-text {
        vertical-align: 0.2rem;
    }
    .todo-root.done > details > summary > .todo-text, .todo-root.done >  .todo-text {
        text-decoration: line-through;
    }
    .children {
        /* don't want this cascading down */
        text-decoration: none;
    }
</style>

<div class="todo-root" class:done={checked}>
    {#if todo.children && (todo.children.length > 0)}
        <details class="todo" open>
            <summary>
                <input class="checkbox" type="checkbox" bind:checked>
                <span class="todo-text">{todo.name}</span>
            </summary>
            <div class="children">
                <TodoList todos={todo.children} />
            </div>
        </details>
    {:else}
        <input class="checkbox" type="checkbox" bind:checked>
        <span class="todo-text">{todo.name}</span>
    {/if}
</div>
