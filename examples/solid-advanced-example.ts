/**
 * Annette-Solid Advanced Example
 * 
 * This example demonstrates the advanced features of Annette-Solid:
 * 1. Algebraic Effects Integration
 * 2. Cross-Network Synchronization
 * 3. Specialized Data Structures
 */
import { 
  // Core reactive primitives
  createSignal, createMemo, createEffect, createRoot,
  // Advanced resource handling
  createEffectResource, createSyncedResource,
  // Cross-network synchronization
  createSharedSignal,
  // Specialized data structures
  createReactiveMap, createReactiveList, createReactiveText,
  // Initialization
  initReactive
} from '../src/solid';

import {
  // Effect system
  EffectAgent, HandlerAgent, ResultScanner,
  // Network system
  Network, NetworkBoundary,
  // Register rules
  registerEffectRules, registerSyncRules, registerSpecializedUpdaterRules
} from '../src/index';

// Create a collaborative document editor application
function createDocumentEditor() {
  console.log("\n=== Collaborative Document Editor ===\n");

  // Initialize networks
  const clientNetwork = Network("client");
  const serverNetwork = Network("server");
  
  // Register necessary rules
  registerEffectRules(clientNetwork);
  registerSyncRules(clientNetwork);
  registerSpecializedUpdaterRules(clientNetwork);
  
  // Create network boundary
  const [clientToBoundary, boundaryToClient] = NetworkBoundary.createBidirectional(
    clientNetwork,
    serverNetwork
  );
  
  // Create effect handler for document operations
  const effectHandler = HandlerAgent({
    'load': async (effect) => {
      console.log(`Loading document ${effect.docId}...`);
      // Simulate loading from server
      return {
        text: `This is the content of document ${effect.docId}`,
        metadata: {
          title: `Document ${effect.docId}`,
          author: "User 1",
          lastModified: new Date().toISOString()
        }
      };
    },
    'save': async (effect) => {
      console.log(`Saving document ${effect.docId}...`);
      console.log(`Content: ${effect.text}`);
      console.log(`Metadata: ${JSON.stringify(effect.metadata)}`);
      // Simulate saving to server
      return {
        success: true,
        timestamp: new Date().toISOString()
      };
    }
  });
  
  // Add handler to network
  clientNetwork.addAgent(effectHandler);
  
  // Create a result scanner for effects
  const scanner = ResultScanner();
  clientNetwork.addAgent(scanner);
  
  // Create document state
  const [documentId, setDocumentId] = createSharedSignal("doc-123", {
    networkId: "editor",
    signalId: "current-document",
    sync: true
  });
  
  // Create document resource using algebraic effects
  const [document, loadDocument] = createEffectResource(
    // Source function
    () => ({ docId: documentId() }),
    // Effect type
    'load',
    // Options
    { name: 'document' }
  );
  
  // Create text editor with sync
  const [text, setText, textOps] = createReactiveText("", {
    networkId: "editor",
    textId: `doc-${documentId()}`,
    sync: true
  });
  
  // Create metadata store
  const [metadata, metadataOps] = createReactiveMap({
    title: "Untitled Document",
    author: "Unknown",
    lastModified: new Date().toISOString()
  }, {
    networkId: "editor",
    mapId: `meta-${documentId()}`,
    sync: true
  });
  
  // Create a comments list
  const [comments, commentOps] = createReactiveList([], {
    networkId: "editor",
    listId: `comments-${documentId()}`,
    sync: true
  });
  
  // Initialize document when loaded
  createEffect(() => {
    const doc = document.latest();
    if (doc) {
      console.log("Document loaded:", doc);
      
      // Set text content
      setText(doc.text);
      
      // Set metadata
      for (const [key, value] of Object.entries(doc.metadata)) {
        metadataOps.set(key, value);
      }
    }
  });
  
  // Show loading state
  createEffect(() => {
    if (document.loading()) {
      console.log("Loading document...");
    }
  });
  
  // Handle errors
  createEffect(() => {
    const err = document.error();
    if (err) {
      console.error("Error loading document:", err);
    }
  });
  
  // Create save function
  const saveDocument = async () => {
    // Create save effect
    const saveEffect = EffectAgent({
      type: 'save',
      docId: documentId(),
      text: text(),
      metadata: metadata()
    });
    
    // Add to network
    clientNetwork.addAgent(saveEffect);
    
    // Connect to handler
    clientNetwork.connectPorts(saveEffect.ports.hold, effectHandler.ports.hold);
    
    // Return a promise that resolves when the save is complete
    return new Promise((resolve) => {
      // In a real implementation, we'd wait for the effect to complete
      // For this example, we'll simulate completion
      setTimeout(() => {
        console.log("Document saved successfully");
        
        // Update last modified
        metadataOps.set('lastModified', new Date().toISOString());
        
        resolve({ success: true });
      }, 500);
    });
  };
  
  // Demo the editor functionality
  setTimeout(() => {
    console.log("\nInitial document state:");
    console.log("Text:", text());
    console.log("Metadata:", metadata());
    console.log("Comments:", comments());
    
    console.log("\nMaking edits...");
    
    // Edit text
    textOps.insertAt(text().length, " This text was added by the client.");
    
    // Update metadata
    metadataOps.set('author', 'Jane Doe');
    
    // Add a comment
    commentOps.push({
      id: 1,
      author: 'Jane Doe',
      text: 'This is a comment',
      timestamp: new Date().toISOString()
    });
    
    console.log("\nAfter edits:");
    console.log("Text:", text());
    console.log("Metadata:", metadata());
    console.log("Comments:", comments());
    
    // Save the document
    console.log("\nSaving document...");
    saveDocument().then(() => {
      console.log("\nDocument saved. Final state:");
      console.log("Text:", text());
      console.log("Metadata:", metadata());
      console.log("Comments:", comments());
    });
  }, 1000);
  
  return {
    documentId,
    setDocumentId,
    text,
    setText,
    textOps,
    metadata,
    metadataOps,
    comments,
    commentOps,
    loadDocument,
    saveDocument
  };
}

// Create a reactive database with distributed cache
function createReactiveDatabase() {
  console.log("\n=== Reactive Database with Distributed Cache ===\n");
  
  // Create reactive cache
  const [cache, cacheOps] = createReactiveMap<string, any>({});
  
  // Create a function to query data with caching
  const createQuery = (queryKey: string, queryFn: () => Promise<any>, options = {}) => {
    // Create a synced resource
    const [resource, refetch] = createSyncedResource(
      // Source function
      () => queryKey,
      // Fetcher function
      async (key) => {
        console.log(`Fetching data for ${key}...`);
        
        // Check cache first
        const cachedData = cache()[key];
        if (cachedData && cachedData.timestamp > Date.now() - 5000) {
          console.log(`Using cached data for ${key}`);
          return cachedData.data;
        }
        
        // Fetch fresh data
        const data = await queryFn();
        
        // Update cache
        cacheOps.set(key, {
          data,
          timestamp: Date.now()
        });
        
        return data;
      },
      // Options
      {
        name: queryKey,
        networkId: "database",
        resourceId: queryKey,
        sync: true
      }
    );
    
    // Invalidate function
    const invalidate = () => {
      // Remove from cache
      cacheOps.delete(queryKey);
      // Refetch
      return refetch(true);
    };
    
    return {
      data: resource.latest,
      loading: resource.loading,
      error: resource.error,
      refetch,
      invalidate
    };
  };
  
  // Demo the reactive database
  const userQuery = createQuery('users', async () => {
    // Simulate API call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          { id: 1, name: 'Jane Doe' },
          { id: 2, name: 'John Smith' }
        ]);
      }, 500);
    });
  });
  
  // Show query results
  createEffect(() => {
    if (userQuery.loading()) {
      console.log("Loading users...");
    } else {
      const users = userQuery.data();
      if (users) {
        console.log("Users loaded:", users);
      }
    }
  });
  
  // Check cache after query completes
  setTimeout(() => {
    console.log("\nCache after first query:", cache());
    
    // Make the same query again (should use cache)
    console.log("\nMaking the same query again...");
    userQuery.refetch();
    
    setTimeout(() => {
      // Invalidate cache and refetch
      console.log("\nInvalidating cache and refetching...");
      userQuery.invalidate();
    }, 1000);
  }, 1000);
  
  return {
    createQuery,
    cache
  };
}

// Run the examples
createRoot(() => {
  console.log("Running Annette-Solid Advanced Examples...\n");
  
  // Run document editor example
  const editor = createDocumentEditor();
  
  // Run reactive database example
  const database = createReactiveDatabase();
  
  console.log("\nAll examples initialized!");
});