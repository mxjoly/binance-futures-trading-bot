import circular from 'circular-functions';
import { ActivationFunction } from './activationFunctions';
import ConnectionGene from './connectionGene';

export interface NNodeParams {
  number: number;
  inputSum: number;
  outputValue: number;
  outputConnections: ConnectionGene[];
  layer: number;
}

class NNode {
  public number: number;
  public inputSum: number; // current sum i.e. before activation
  public outputValue: number; // after activation function is applied
  public outputConnections: ConnectionGene[];
  public layer: number;

  // Circular function
  private _c = circular.register('NNode');

  constructor(no: number) {
    this.number = no;
    this.inputSum = 0;
    this.outputValue = 0;
    this.outputConnections = [];
    this.layer = 0;
  }

  /**
   * The node sends its output to the inputs of the nodes its connected to
   */
  public engage(func: ActivationFunction) {
    if (this.layer !== 0) {
      // no sigmoid for the inputs and bias
      this.outputValue = func(this.inputSum);
    }

    for (var i = 0; i < this.outputConnections.length; i++) {
      // for each connection
      if (this.outputConnections[i].enabled) {
        // don't do shit if not enabled
        this.outputConnections[i].toNode.inputSum +=
          this.outputConnections[i].weight * this.outputValue; // add the weighted output to the sum of the inputs of whatever node this node is connected to
      }
    }
  }

  /**
   * Returns whether this node connected to the parameter node used when adding a new connection
   * @param node
   */
  public isConnectedTo(node: NNode) {
    if (node.layer == this.layer) {
      // nodes in the same layer cannot be connected
      return false;
    }

    if (node.layer < this.layer) {
      for (var i = 0; i < node.outputConnections.length; i++) {
        if (node.outputConnections[i].toNode == this) {
          return true;
        }
      }
    } else {
      for (var i = 0; i < this.outputConnections.length; i++) {
        if (this.outputConnections[i].toNode == node) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Returns a copy of this node
   */
  public clone() {
    var clone = new NNode(this.number);
    clone.layer = this.layer;
    return clone;
  }
}

export default NNode;
