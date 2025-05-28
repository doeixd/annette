import { serializeValue } from '../serialization'; 
import { Hash, AgentName, PortName, AgentId } from './types';

/**
 * Computes a SHA-256 hash for the given string data using Web Crypto API.
 * @param data The string data to hash.
 * @returns A promise that resolves to a hex string representing the hash.
 *          Returns a promise that resolves to an empty string if Web Crypto is unavailable.
 */
export async function hashString(data: string): Promise<Hash> {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        try {
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(data);
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
            return hashHex;
        } catch (error) {
            console.error("Error hashing string with Web Crypto:", error);
            return ""; // Fallback or error indication
        }
    } else {
        console.warn("Web Crypto API not available. Cannot hash string.");
        // In a Node.js environment or older browser, this path would be taken.
        // Consider a fallback or polyfill if support for such environments is critical.
        // For this exercise, we'll simulate Node.js crypto if window.crypto is not available.
        if (typeof require !== 'undefined') {
            try {
                const cryptoNode = require('crypto');
                const hash = cryptoNode.createHash('sha256');
                hash.update(data);
                return hash.digest('hex');
            } catch (nodeError) {
                console.error("Error hashing string with Node.js crypto fallback:", nodeError);
                return ""; // Fallback or error indication
            }
        }
        return ""; // Fallback or error indication
    }
}

/**
 * Serializes an agent's value and computes its hash using Web Crypto.
 * @param value The agent's value.
 * @returns A promise that resolves to an object containing the serialized value and its hash.
 */
export async function serializeAndHashValue(value: any): Promise<{ serializedValue: string, valueHash: Hash }> {
    const serializedValue = serializeValue(value); // This remains synchronous
    const valueHash = await hashString(serializedValue);
    return { serializedValue, valueHash };
}

/**
 * Serializes an agent's structural information (name and port connections) and computes its hash using Web Crypto.
 * @param agentName The name of the agent.
 * @param portConnections The agent's port connections map.
 * @returns A promise that resolves to an object containing the structure hash.
 */
export async function serializeAndHashStructure(
    agentName: AgentName,
    portConnections: Record<PortName, { connectedToAgentId: AgentId, connectedToPortName: PortName } | null>
): Promise<{ structureHash: Hash }> {
    // Canonical serialization of portConnections: sort by port name
    const sortedPortConnections: Record<string, any> = {};
    const portNames = Object.keys(portConnections).sort();
    for (const portName of portNames) {
        sortedPortConnections[portName] = portConnections[portName];
    }

    const structureString = JSON.stringify({
        name: agentName,
        connections: sortedPortConnections,
    });
    const structureHash = await hashString(structureString);
    return { structureHash };
}
