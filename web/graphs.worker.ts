import * as beebrain from "../road/src/beebrain.js";
import * as bgraph from "../road/src/bgraph.js";

class FakeElement {
    nodeName: string;
    _innerAttrs: object;
    children: FakeElement[];
    namespaceURI: string;
    ownerDocument: any;
    style: any;
    constructor(name, uri = null) {
        this.nodeName = name.toUpperCase();
        this._innerAttrs = Object.create(null);
        this.children = [];
        this.namespaceURI = uri;
        this.ownerDocument = globalOwnerDocument;
        this.style = {
            styles: [],
            setProperty(name, val, pri) {
                if (pri) throw new Error("can't handle !important");
                this.styles.push(`${name}: ${val};`);
            }
        };
    }
    setAttribute(key, val) {
        key = key.toLowerCase();
        if (key === "style") throw new Error("can't set style with setAttribute");
        this._innerAttrs[key] = val;
    }
    setAttributeNS(space, local, value) {
        this.setAttribute(`${space}:${local}`, value);
    }
    insertBefore(newNode, refNode) {
        if (newNode.nodeName !== "STYLE") throw new Error("insertBefore assumes element with meaningless order");
        this.children.push(newNode);
    }
    appendChild(child) {
        this.children.push(child);
        return child;
    }
    addEventListener() {}
    removeEventListener() {}
}

let globalOwnerDocument = {
    createElementNS: (uri, name) => {
        return new FakeElement(name, uri);
    }
};

// we don't bother with checking the target origin, since we don't use any
// persistent data
self.addEventListener("message", e => {
    if (!e.data || !e.data.type) {
        console.warn("Ignored message without type property.");
        return;
    }
    if (e.data.type === "genGraphs") {
        // start generating graphs
        e.data.goals.forEach(goal => {
            // TODO: generate

            let pmData: any = {
                type: "graphImg",
                goalId: goal.id,
            };
            // for very weird reasons beebrain decides to mess with *our* params.road when passed params
            // const brain = new beebrain(goal);
            // const stats = brain.getStats();
            // console.log("brain", brain, stats);
            // if (stats.error) {
            //     pmData.error = stats.error;
            // } else {
            //     pmData.stats = stats;
            // }
            // https://github.com/beeminder/road/blob/master/tutorials/bgraph.md
            const fakeDivGraph = {
                nodeName: "DIV",
                _innerAttrs: Object.create(null),
                _innerSvg: {
                    nodeName: "SVG",
                    _innerAttrs: Object.create(null),
                    children: [],
                    setAttribute: (key, val) => fakeDivGraph._innerSvg._innerAttrs[key] = val,
                    setAttributeNS: (space, local, value) => fakeDivGraph._innerSvg.setAttribute(`${space}:${local}`, value),
                    appendChild: child => {
                        fakeDivGraph._innerSvg.children.push(child);
                        return child;
                    },
                    ownerDocument: globalOwnerDocument,
                },
                setAttribute: (key, val) => fakeDivGraph._innerAttrs[key] = val,
                _svgCreated: false,
                _svgAppended: false,
                ownerDocument: {
                    createElementNS: () => {
                        if (fakeDivGraph._svgCreated) throw new Error("only expected 1 creation on fakeDivGraph");
                        fakeDivGraph._svgCreated = true;
                        return fakeDivGraph._innerSvg;
                    }
                },
                appendChild: child => {
                    if (fakeDivGraph._svgAppended) throw new Error("only expected 1 append on fakeDivGraph");
                    fakeDivGraph._svgAppended = true;
                    console.log("appending child to fakeDivGraph");
                    return child;
                }
            };
            const graph = new bgraph({
                divGraph: fakeDivGraph,
                showContext: true,
                ctxRect: { x: 0, y: 453, width: 800, height: 100 },
            });
            graph.loadGoalJSON(goal);
            const fakeOutEle = {};
            graph.saveGraph(fakeOutEle)
            console.log(fakeOutEle, fakeDivGraph);
            // @ts-ignore
            self.postMessage(pmData);
        });
    } else {
        console.warn("Ignored message with unknown type", e.data.type);
    }
});
