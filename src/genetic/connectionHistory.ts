import Genome from './genome';
import NNode from './node';

class ConnectionHistory {
  public fromNode: number;
  public toNode: number;
  public innovationNumber: number;
  public innovationNumbers: number[];

  constructor(
    from: number,
    to: number,
    innovationNo: number,
    innovationNos: number[]
  ) {
    this.fromNode = from;
    this.toNode = to;
    this.innovationNumber = innovationNo;
    this.innovationNumbers = []; // the innovation Numbers from the connections of the genome which first had this mutation
    // this represents the genome and allows us to test if another genomes is the same
    // this is before this connection was added
    this.innovationNumbers = [...innovationNos];
  }

  /**
   * Returns whether the genome matches the original genome and the connection is between the same nodes
   * @param genome
   * @param from
   * @param to
   */
  matches(genome: Genome, from: NNode, to: NNode) {
    if (genome.genes.length === this.innovationNumbers.length) {
      // if the number of connections are different then the genomes aren't the same
      if (from.number === this.fromNode && to.number === this.toNode) {
        // next check if all the innovation numbers match from the genome
        for (var i = 0; i < genome.genes.length; i++) {
          if (!this.innovationNumbers.includes(genome.genes[i].innovationNo)) {
            return false;
          }
        }
        // if reached this far then the innovationNumbers match the genes innovation numbers and
        // the connection is between the same nodes so it does match
        return true;
      }
    }
    return false;
  }
}

export default ConnectionHistory;
