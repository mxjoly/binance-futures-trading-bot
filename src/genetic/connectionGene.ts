import { random, randomGaussian } from '../utils/math';
import NNode from './node';

/**
 * A connection between 2 nodes
 */
class ConnectionGene {
  public fromNode: NNode;
  public toNode: NNode;
  public weight: number;
  public enabled: boolean;
  public innovationNo: number; // each connection is given a innovation number to compare genomes

  constructor(from: NNode, to: NNode, weight: number, innovationNo: number) {
    this.fromNode = from;
    this.toNode = to;
    this.weight = weight;
    this.enabled = true;
    this.innovationNo = innovationNo;
  }

  /**
   * Change the weight of the connection
   */
  mutateWeight() {
    var rand = random();
    if (rand < 0.1) {
      // 10% of the time completely change the this.weight
      this.weight = random(-1, 1);
    } else {
      // otherwise slightly change it
      this.weight += randomGaussian() / 50;
      // keep weight between bounds
      if (this.weight > 1) {
        this.weight = 1;
      }
      if (this.weight < -1) {
        this.weight = -1;
      }
    }
  }

  /**
   * Returns a copy of this connectionGene
   * @param from
   * @param to
   */
  clone(from: NNode, to: NNode) {
    var clone = new ConnectionGene(from, to, this.weight, this.innovationNo);
    clone.enabled = this.enabled;
    return clone;
  }
}

export default ConnectionGene;
