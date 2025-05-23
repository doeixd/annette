// Advanced example showing complex state updates with the UpdateRule
import { 
  Agent, 
  Network, 
  Port, 
  UpdateRule,
  Connection
} from '../src';

// Create a user agent with various properties
const user = Agent('User', {
  id: 'user123',
  name: 'John Doe',
  email: 'john@example.com',
  preferences: {
    theme: 'light',
    notifications: true,
    language: 'en'
  },
  stats: {
    lastLogin: new Date().toISOString(),
    loginCount: 0
  }
}, {
  main: Port({ name: 'main', type: 'main' }),
  update: Port({ name: 'update', type: 'aux' }),
  stats: Port({ name: 'stats', type: 'aux' })
});

// Create different types of updaters for the user
const preferencesUpdater = Agent('PreferencesUpdater', {
  changes: {
    theme: 'dark',
    notifications: false
  }
}, {
  main: Port({ name: 'main', type: 'main' })
});

const profileUpdater = Agent('ProfileUpdater', {
  changes: {
    name: 'John Smith',
    email: 'john.smith@example.com'
  }
}, {
  main: Port({ name: 'main', type: 'main' })
});

const statsUpdater = Agent('StatsUpdater', {
  action: 'login'
}, {
  main: Port({ name: 'main', type: 'main' })
});

// Create a network with our agents
const network = Network('ComplexUpdateExample', [
  user, preferencesUpdater, profileUpdater, statsUpdater
]);

// Add preference update rule
network.addRule(UpdateRule(
  user.ports.update,
  preferencesUpdater.ports.main,
  (user, updater) => {
    // Get current preferences
    const currentPrefs = user.value.preferences;
    
    // Merge with updates
    const newPrefs = {
      ...currentPrefs,
      ...updater.value.changes
    };
    
    return {
      newState: {
        preferences: newPrefs
      },
      description: `Updated user preferences: ${Object.keys(updater.value.changes).join(', ')}`
    };
  },
  'update-preferences'
));

// Add profile update rule
network.addRule(UpdateRule(
  user.ports.update,
  profileUpdater.ports.main,
  (user, updater) => {
    // Only update specified fields
    return {
      newState: updater.value.changes,
      description: `Updated user profile: ${Object.keys(updater.value.changes).join(', ')}`
    };
  },
  'update-profile'
));

// Add stats update rule
network.addRule(UpdateRule(
  user.ports.stats,
  statsUpdater.ports.main,
  (user, updater) => {
    const currentStats = user.value.stats;
    let newStats = { ...currentStats };
    
    // Handle different stat update types
    if (updater.value.action === 'login') {
      newStats.lastLogin = new Date().toISOString();
      newStats.loginCount = currentStats.loginCount + 1;
    }
    
    return {
      newState: { stats: newStats },
      description: `Updated user stats: ${updater.value.action}`
    };
  },
  'update-stats'
));

console.log('Initial user state:');
console.log(JSON.stringify(user.value, null, 2));

// Apply preference update
network.connectPorts(user.ports.update, preferencesUpdater.ports.main);
network.step();

console.log('\nAfter preferences update:');
console.log(JSON.stringify(user.value, null, 2));

// Apply profile update
network.disconnectPorts(user.ports.update, preferencesUpdater.ports.main);
network.connectPorts(user.ports.update, profileUpdater.ports.main);
network.step();

console.log('\nAfter profile update:');
console.log(JSON.stringify(user.value, null, 2));

// Apply stats update
network.connectPorts(user.ports.stats, statsUpdater.ports.main);
network.step();

console.log('\nAfter stats update:');
console.log(JSON.stringify(user.value, null, 2));

// View complete update history
console.log('\nComplete update history:');
if (network.getUpdateHistory) {
  console.log(JSON.stringify(network.getUpdateHistory(), null, 2));
}