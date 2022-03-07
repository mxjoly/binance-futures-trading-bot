import { random } from '../utils/math';
import * as activation from './activationFunctions';
import ConnectionGene from './connectionGene';
import ConnectionHistory from './connectionHistory';
import NNode from './node';

let nextConnectionNo = 1000;

class Genome {
  private inputs: number;
  private outputs: number;
  public genes: ConnectionGene[]; // a list of connections between nodes which represent the NN
  private nodes: NNode[];
  private layers: number;
  private network: NNode[]; // a list of the nodes in the order that they need to be considered in the NN
  private nextNode: number;
  private biasNode: number;

  constructor(inputs: number, outputs: number, crossover?: boolean) {
    this.genes = [];
    this.nodes = [];
    this.inputs = inputs;
    this.outputs = outputs;
    this.layers = 2;
    this.nextNode = 0;
    // this.biasNode;
    this.network = [];

    if (crossover) {
      return;
    }

    for (var i = 0; i < this.inputs; i++) {
      this.nodes.push(new NNode(i));
      this.nextNode++;
      this.nodes[i].layer = 0;
    }

    // create output this.nodes
    for (var i = 0; i < this.outputs; i++) {
      this.nodes.push(new NNode(i + this.inputs));
      this.nodes[i + this.inputs].layer = 1;
      this.nextNode++;
    }

    this.nodes.push(new NNode(this.nextNode)); // bias node
    this.biasNode = this.nextNode;
    this.nextNode++;
    this.nodes[this.biasNode].layer = 0;
  }

  fullyConnect(innovationHistory: ConnectionHistory[]) {
    // this will be a new number if no identical genome has mutated in the same
    for (var i = 0; i < this.inputs; i++) {
      for (var j = 0; j < this.outputs; j++) {
        var connectionInnovationNumber = this.getInnovationNumber(
          innovationHistory,
          this.nodes[i],
          this.nodes[this.nodes.length - j - 2]
        );
        this.genes.push(
          new ConnectionGene(
            this.nodes[i],
            this.nodes[this.nodes.length - j - 2],
            random(-1, 1),
            connectionInnovationNumber
          )
        );
      }
    }

    var connectionInnovationNumber = this.getInnovationNumber(
      innovationHistory,
      this.nodes[this.biasNode],
      this.nodes[this.nodes.length - 2]
    );

    this.genes.push(
      new ConnectionGene(
        this.nodes[this.biasNode],
        this.nodes[this.nodes.length - 2],
        random(-1, 1),
        connectionInnovationNumber
      )
    );

    connectionInnovationNumber = this.getInnovationNumber(
      innovationHistory,
      this.nodes[this.biasNode],
      this.nodes[this.nodes.length - 3]
    );

    this.genes.push(
      new ConnectionGene(
        this.nodes[this.biasNode],
        this.nodes[this.nodes.length - 3],
        random(-1, 1),
        connectionInnovationNumber
      )
    );

    //add the connection with a random array

    //changed this so if error here
    this.connectNodes();
  }

  /**
   * Returns the node with a matching number sometimes the nodes will not be in order
   * @param nodeNumber
   */
  getNode(nodeNumber: number) {
    for (var i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i].number == nodeNumber) {
        return this.nodes[i];
      }
    }
    return null;
  }

  /**
   * Adds the connections going out of a node to that node so that it can access the next node during feeding forward
   */
  connectNodes() {
    for (var i = 0; i < this.nodes.length; i++) {
      // clear the connections
      this.nodes[i].outputConnections = [];
    }

    for (var i = 0; i < this.genes.length; i++) {
      // for each connectionGene
      this.genes[i].fromNode.outputConnections.push(this.genes[i]); // add it to node
    }
  }

  /**
   * Feeding in input values for the NN and returning output array
   */
  feedForward(inputValues: number[], activationFunc = activation.logistic) {
    // inputValues = [
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    //   Math.random(),
    // ];

    // set the outputs of the input nodes
    for (var i = 0; i < this.inputs; i++) {
      this.nodes[i].outputValue = inputValues[i];
    }
    this.nodes[this.biasNode].outputValue = 1; // output of bias is 1

    for (var i = 0; i < this.network.length; i++) {
      // for each node in the network engage it (see node class for what this does)
      this.network[i].engage(activationFunc);
    }

    // the outputs are nodes[inputs] to nodes[inputs+outputs-1]
    var outs = [];
    for (var i = 0; i < this.outputs; i++) {
      outs[i] = this.nodes[this.inputs + i].outputValue;
    }

    for (var i = 0; i < this.nodes.length; i++) {
      // reset all the nodes for the next feed forward
      this.nodes[i].inputSum = 0;
    }

    //console.log(outs);

    return outs;
  }

  /**
   * Sets up the NN as a list of nodes in order to be engaged
   */
  generateNetwork() {
    this.connectNodes();
    this.network = [];

    // for each layer add the node in that layer, since layers cannot connect to themselves there is no need to order the nodes within a layer
    for (var l = 0; l < this.layers; l++) {
      // for each layer
      for (var i = 0; i < this.nodes.length; i++) {
        // for each node
        if (this.nodes[i].layer == l) {
          // if that node is in that layer
          this.network.push(this.nodes[i]);
        }
      }
    }
  }
  //-----------------------------------------------------------------------------------------------------------------------------------------

  /**
   * Mutate the NN by adding a new node. It does this by picking a random connection and disabling
   * it then 2 new connections are added 1 between the input node of the disabled connection and the new node
   * and the other between the new node and the output of the disabled connection
   */
  addNode(innovationHistory: ConnectionHistory[]) {
    //pick a random connection to create a node between
    if (this.genes.length == 0) {
      this.addConnection(innovationHistory);
      return;
    }
    var randomConnection = Math.floor(random(this.genes.length));

    while (
      this.genes[randomConnection].fromNode == this.nodes[this.biasNode] &&
      this.genes.length != 1
    ) {
      // dont disconnect bias
      randomConnection = Math.floor(random(this.genes.length));
    }

    this.genes[randomConnection].enabled = false; // disable it

    var newNodeNo = this.nextNode;
    this.nodes.push(new NNode(newNodeNo));
    this.nextNode++;

    // add a new connection to the new node with a weight of 1
    var connectionInnovationNumber = this.getInnovationNumber(
      innovationHistory,
      this.genes[randomConnection].fromNode,
      this.getNode(newNodeNo)
    );

    this.genes.push(
      new ConnectionGene(
        this.genes[randomConnection].fromNode,
        this.getNode(newNodeNo),
        1,
        connectionInnovationNumber
      )
    );

    connectionInnovationNumber = this.getInnovationNumber(
      innovationHistory,
      this.getNode(newNodeNo),
      this.genes[randomConnection].toNode
    );

    //add a new connection from the new node with a weight the same as the disabled connection
    this.genes.push(
      new ConnectionGene(
        this.getNode(newNodeNo),
        this.genes[randomConnection].toNode,
        this.genes[randomConnection].weight,
        connectionInnovationNumber
      )
    );

    this.getNode(newNodeNo).layer =
      this.genes[randomConnection].fromNode.layer + 1;

    connectionInnovationNumber = this.getInnovationNumber(
      innovationHistory,
      this.nodes[this.biasNode],
      this.getNode(newNodeNo)
    );

    // connect the bias to the new node with a weight of 0
    this.genes.push(
      new ConnectionGene(
        this.nodes[this.biasNode],
        this.getNode(newNodeNo),
        0,
        connectionInnovationNumber
      )
    );

    // If the layer of the new node is equal to the layer of the output node of the old connection then a new layer needs to be created
    // more accurately the layer numbers of all layers equal to or greater than this new node need to be incremented
    if (
      this.getNode(newNodeNo).layer == this.genes[randomConnection].toNode.layer
    ) {
      for (var i = 0; i < this.nodes.length - 1; i++) {
        //dont include this newest node
        if (this.nodes[i].layer >= this.getNode(newNodeNo).layer) {
          this.nodes[i].layer++;
        }
      }
      this.layers++;
    }
    this.connectNodes();
  }

  /**
   * Adds a connection between 2 this.nodes which aren't currently connected
   * @param innovationHistory
   */
  addConnection(innovationHistory: ConnectionHistory[]) {
    // cannot add a connection to a fully connected network
    if (this.fullyConnected()) {
      console.log('connection failed');
      return;
    }

    // get random nodes
    var randomNode1 = Math.floor(random(this.nodes.length));
    var randomNode2 = Math.floor(random(this.nodes.length));
    while (this.randomConnectionNodesAreShit(randomNode1, randomNode2)) {
      // while the random this.nodes are no good get new ones
      randomNode1 = Math.floor(random(this.nodes.length));
      randomNode2 = Math.floor(random(this.nodes.length));
    }
    var temp: number;
    if (this.nodes[randomNode1].layer > this.nodes[randomNode2].layer) {
      // if the first random node is after the second then switch
      temp = randomNode2;
      randomNode2 = randomNode1;
      randomNode1 = temp;
    }

    // get the innovation number of the connection
    // this will be a new number if no identical genome has mutated in the same way
    var connectionInnovationNumber = this.getInnovationNumber(
      innovationHistory,
      this.nodes[randomNode1],
      this.nodes[randomNode2]
    );

    // add the connection with a random array
    this.genes.push(
      new ConnectionGene(
        this.nodes[randomNode1],
        this.nodes[randomNode2],
        random(-1, 1),
        connectionInnovationNumber
      )
    );

    //changed this so if error here
    this.connectNodes();
  }

  randomConnectionNodesAreShit(rand1: number, rand2: number) {
    if (this.nodes[rand1].layer == this.nodes[rand2].layer) return true; // if the nodes are in the same layer
    if (this.nodes[rand1].isConnectedTo(this.nodes[rand2])) return true; // if the nodes are already connected
    return false;
  }

  /**
   * Returns the innovation number for the new mutation
   * If this mutation has never been seen before then it will be given a new unique innovation number
   * If this mutation matches a previous mutation then it will be given the same innovation number as the previous one
   * @param innovationHistory
   * @param from
   * @param to
   */
  getInnovationNumber(
    innovationHistory: ConnectionHistory[],
    from: NNode,
    to: NNode
  ) {
    var isNew = true;
    var connectionInnovationNumber = nextConnectionNo;
    for (var i = 0; i < innovationHistory.length; i++) {
      // for each previous mutation
      if (innovationHistory[i].matches(this, from, to)) {
        // if match found
        isNew = false; // its not a new mutation
        connectionInnovationNumber = innovationHistory[i].innovationNumber; // set the innovation number as the innovation number of the match
        break;
      }
    }

    if (isNew) {
      // if the mutation is new then create an arrayList of varegers representing the current state of the genome
      var innovationNumbers = [];
      for (var i = 0; i < this.genes.length; i++) {
        // set the innovation numbers
        innovationNumbers.push(this.genes[i].innovationNo);
      }

      //then add this mutation to the innovationHistory
      innovationHistory.push(
        new ConnectionHistory(
          from.number,
          to.number,
          connectionInnovationNumber,
          innovationNumbers
        )
      );
      nextConnectionNo++;
    }
    return connectionInnovationNumber;
  }

  //
  /**
   * Returns whether the network is fully connected or not
   */
  fullyConnected() {
    var maxConnections = 0;
    var nodesInLayers = []; // array which stored the amount of this.nodes in each layer

    for (var i = 0; i < this.layers; i++) {
      nodesInLayers[i] = 0;
    }

    // populate array
    for (var i = 0; i < this.nodes.length; i++) {
      nodesInLayers[this.nodes[i].layer] += 1;
    }

    // for each layer the maximum amount of connections is the number in this layer * the number of this.nodes in front of it
    // so lets add the max for each layer together and then we will get the maximum amount of connections in the network
    for (var i = 0; i < this.layers - 1; i++) {
      var nodesInFront = 0;
      for (var j = i + 1; j < this.layers; j++) {
        // for each layer in front of this layer
        nodesInFront += nodesInLayers[j]; // add up nodes
      }

      maxConnections += nodesInLayers[i] * nodesInFront;
    }

    if (maxConnections <= this.genes.length) {
      // if the number of connections is equal to the max number of connections possible then it is full
      return true;
    }

    return false;
  }

  /**
   * mutates the genome
   * @param innovationHistory
   */
  mutate(innovationHistory: ConnectionHistory[]) {
    if (this.genes.length == 0) {
      this.addConnection(innovationHistory);
    }

    // 80% of the time mutate weights
    var rand1 = random(1);
    if (rand1 < 0.8) {
      for (var i = 0; i < this.genes.length; i++) {
        this.genes[i].mutateWeight();
      }
    }

    // 5% of the time add a new connection
    var rand2 = random(1);
    if (rand2 < 0.05) {
      this.addConnection(innovationHistory);
    }

    // 1% of the time add a node
    var rand3 = random(1);
    if (rand3 < 0.01) {
      this.addNode(innovationHistory);
    }
  }

  /**
   * Called when this Genome is better that the other parent
   * @param parent
   */
  crossover(parent: Genome) {
    var child = new Genome(this.inputs, this.outputs, true);
    child.genes = [];
    child.nodes = [];
    child.layers = this.layers;
    child.nextNode = this.nextNode;
    child.biasNode = this.biasNode;
    var childGenes: ConnectionGene[] = []; // list of genes to be inherited form the parents
    var isEnabled: boolean[] = [];

    //all inherited genes
    for (var i = 0; i < this.genes.length; i++) {
      var setEnabled = true; // is this node in the child going to be enabled
      var parentGene = this.matchingGene(parent, this.genes[i].innovationNo);
      if (parentGene !== -1) {
        // if the genes match
        if (!this.genes[i].enabled || !parent.genes[parentGene].enabled) {
          // if either of the matching genes are disabled
          if (random(1) < 0.75) {
            // 75% of the time disable the child gene
            setEnabled = false;
          }
        }

        var rand = random(1);
        if (rand < 0.5) {
          childGenes.push(this.genes[i]);
          // get gene from this fucker
        } else {
          // get gene from parent
          childGenes.push(parent.genes[parentGene]);
        }
      } else {
        // disjoint or excess gene
        childGenes.push(this.genes[i]);
        setEnabled = this.genes[i].enabled;
      }
      isEnabled.push(setEnabled);
    }

    // since all excess and disjoint genes are inherited from the more fit parent (this Genome) the child structure is no different from this parent | with exception of dormant connections being enabled but this wont effect this.nodes
    // so all the this.nodes can be inherited from this parent
    for (var i = 0; i < this.nodes.length; i++) {
      child.nodes.push(this.nodes[i].clone());
    }

    // clone all the connections so that they connect the child nodes
    for (var i = 0; i < childGenes.length; i++) {
      child.genes.push(
        childGenes[i].clone(
          child.getNode(childGenes[i].fromNode.number),
          child.getNode(childGenes[i].toNode.number)
        )
      );
      child.genes[i].enabled = isEnabled[i];
    }

    child.connectNodes();
    return child;
  }

  /**
   * Returns whether or not there is a gene matching the input innovation number  in the input genome
   */
  matchingGene(parent2: Genome, innovation: number) {
    for (var i = 0; i < parent2.genes.length; i++) {
      if (parent2.genes[i].innovationNo == innovation) {
        return i;
      }
    }
    return -1; // no matching gene found
  }

  /**
   * Prints out info about the genome to the console
   */
  printGenome() {
    console.log('Previous genome layers:' + this.layers);
    console.log('Bias node: ' + this.biasNode);
    console.log('Nodes');
    for (var i = 0; i < this.nodes.length; i++) {
      console.log(this.nodes[i].number + ',');
    }
    console.log('Genes');
    for (var i = 0; i < this.genes.length; i++) {
      // for each connectionGene
      console.log(
        'gene ' +
          this.genes[i].innovationNo +
          'From node ' +
          this.genes[i].fromNode.number +
          'To node ' +
          this.genes[i].toNode.number +
          'is enabled ' +
          this.genes[i].enabled +
          'from layer ' +
          this.genes[i].fromNode.layer +
          'to layer ' +
          this.genes[i].toNode.layer +
          'weight: ' +
          this.genes[i].weight
      );
    }

    console.log();
  }

  /**
   * Returns a copy of this genome
   */
  clone() {
    var clone = new Genome(this.inputs, this.outputs, true);
    for (var i = 0; i < this.nodes.length; i++) {
      // copy nodes
      clone.nodes.push(this.nodes[i].clone());
    }

    // copy all the connections so that they connect the clone new this.nodes

    for (var i = 0; i < this.genes.length; i++) {
      // copy genes
      clone.genes.push(
        this.genes[i].clone(
          clone.getNode(this.genes[i].fromNode.number),
          clone.getNode(this.genes[i].toNode.number)
        )
      );
    }

    clone.layers = this.layers;
    clone.nextNode = this.nextNode;
    clone.biasNode = this.biasNode;
    clone.connectNodes();

    return clone;
  }
}

export default Genome;
