import { Network, renderToGraph } from "../src";

const network = Network("dom-graph");

const template = {
  tag: "section",
  attrs: { class: "card" },
  children: [
    {
      tag: "h1",
      children: [{ tag: "text", text: "Hello Graph" }],
    },
    {
      tag: "p",
      children: [{ tag: "text", text: "Mounted with renderToGraph." }],
    },
  ],
};

const root = renderToGraph(network, template);

if (root.name === "Element" && root.value.ref) {
  document.body.appendChild(root.value.ref);
}
