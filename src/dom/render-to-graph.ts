import { Agent, type IAgent } from "../agent";
import type { INetwork } from "../network";
import { Port } from "../port";

export interface IGraphTemplate {
  tag: string;
  attrs?: Record<string, unknown>;
  children?: IGraphTemplate[];
  text?: string;
}

type DomElementValue = {
  tagName: string;
  ref: HTMLElement | null;
};

type DomTextValue = {
  content: string;
  ref: Text | null;
};

type DomAttributeValue = {
  key: string;
  value: string;
};

const elementPorts = {
  parent: Port({ name: "parent", type: "aux" }),
  firstChild: Port({ name: "firstChild", type: "aux" }),
  attrs: Port({ name: "attrs", type: "aux" }),
};

const textPorts = {
  parent: Port({ name: "parent", type: "aux" }),
};

const attributePorts = {
  attrs: Port({ name: "attrs", type: "aux" }),
};

type DomElementAgent = IAgent<"Element", DomElementValue, "dom", typeof elementPorts>;

type DomTextAgent = IAgent<"TextNode", DomTextValue, "dom", typeof textPorts>;

type DomAttributeAgent = IAgent<"Attribute", DomAttributeValue, "dom", typeof attributePorts>;

type DomAgent = DomElementAgent | DomTextAgent;

type DomParentAgent = DomElementAgent;

const Element = Agent.factory<"Element", DomElementValue, "dom", typeof elementPorts>("Element", {
  type: "dom",
  ports: elementPorts,
});

const TextNode = Agent.factory<"TextNode", DomTextValue, "dom", typeof textPorts>("TextNode", {
  type: "dom",
  ports: textPorts,
});

const Attribute = Agent.factory<"Attribute", DomAttributeValue, "dom", typeof attributePorts>("Attribute", {
  type: "dom",
  ports: attributePorts,
});

/**
 * Builds a DOM-backed agent graph from a template tree.
 * Creates agents, connects parent/child and attribute ports,
 * and appends DOM nodes for the mounted subtree.
 */
export function renderToGraph(
  network: INetwork,
  template: IGraphTemplate,
  parentAgent: DomParentAgent | null = null
): DomAgent {
  const { tag, attrs, children, text } = template;

  let currentAgent: DomAgent;

  if (tag === "text") {
    const content = text ?? "";
    currentAgent = TextNode({ content, ref: document.createTextNode(content) });
  } else {
    currentAgent = Element({ tagName: tag, ref: document.createElement(tag) });
  }

  network.addAgent(currentAgent);

  if (parentAgent) {
    network.connectPorts(parentAgent.ports.firstChild, currentAgent.ports.parent);

    const parentRef = parentAgent.value.ref;
    const childRef = currentAgent.value.ref;

    if (parentRef && childRef) {
      parentRef.appendChild(childRef);
    }
  }

  if (attrs && currentAgent.name === "Element") {
    Object.entries(attrs).forEach(([key, value]) => {
      const attrAgent: DomAttributeAgent = Attribute({ key, value: String(value) });
      network.addAgent(attrAgent);
      network.connectPorts(currentAgent.ports.attrs, attrAgent.ports.attrs);
    });
  }

  if (children && currentAgent.name === "Element") {
    children.forEach((childTemplate) => {
      renderToGraph(network, childTemplate, currentAgent);
    });
  }

  return currentAgent;
}
