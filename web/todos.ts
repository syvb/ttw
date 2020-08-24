// There are two ways todos are repersented:
// 1. In the database, as an array of items. Children are *not* nested under their parents,
//    it's all one flat list. RawTodos
// 2. As an array of root todos, which have a `children` key with their children todos, which
//    themselves can have todos. Todo

type RawTodos = {
    id: number,
    name: string,
    children: number[],
    done: number, // 0 = false, 1 = true, indexeddb doesn't support booleans
    expanded: boolean,
    root: boolean,
}[];

type Todo = {
    id: number,
    name: string,
    children: Todo[],
    done: boolean,
    expanded: boolean,
};

function getDoneTodos(): Promise<RawTodos> {
    return window.db.todos.where("done").equals(1).toArray();
}

function getPendingTodos(): Promise<RawTodos> {
    return window.db.todos.where("done").equals(0).toArray();
}

function parseDbTodos(raw: RawTodos): Todo[] {
    let parsed = [];
    return parsed;
}
