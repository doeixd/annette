import { Agent } from '../src/agent';
import { Network } from '../src/network';


const hello = Network('')

const alice = Agent('Alice', 'Alice')
const bob = Agent('Bob', 'Bob')


// this needs to add the agents if they don't exist
hello.connect(alice, bob)

hello.addRule(alice, bob, alias((alice, bob) => {

}))







