import { random } from '../utils/math';
import ConnectionHistory from './connectionHistory';
import Genome from './genome';
import Player from './player';

class Species {
  public players: Player[];
  public bestFitness: number;
  public champ: Player;
  public averageFitness: number;
  public staleness: number; // how many generations the species has gone without an improvement
  private rep: Genome;

  // coefficients for testing compatibility
  private excessCoeff: number;
  private weightDiffCoeff: number;
  private compatibilityThreshold: number;

  constructor(player: Player) {
    this.players = [];
    this.bestFitness = 0;
    this.champ;
    this.averageFitness = 0;
    this.staleness = 0; //how many generations the species has gone without an improvement
    this.rep;

    // coefficients for testing compatibility
    this.excessCoeff = 1;
    this.weightDiffCoeff = 0.5;
    this.compatibilityThreshold = 3;
    if (player) {
      this.players.push(player);
      //since it is the only one in the species it is by default the best
      this.bestFitness = player.fitness;
      this.rep = player.brain.clone();
      this.champ = player.cloneForReplay();
    }
  }

  /**
   * Returns whether the parameter genome is in this species
   * @param genome
   * @returns
   */
  sameSpecies(genome: Genome) {
    var compatibility: number;
    var excessAndDisjoint = this.getExcessDisjoint(genome, this.rep); // get the number of excess and disjoint genes between this player and the current species this.rep
    var averageWeightDiff = this.averageWeightDiff(genome, this.rep); // get the average weight difference between matching genes

    var largeGenomeNormalizer = genome.genes.length - 20;
    if (largeGenomeNormalizer < 1) {
      largeGenomeNormalizer = 1;
    }

    compatibility =
      (this.excessCoeff * excessAndDisjoint) / largeGenomeNormalizer +
      this.weightDiffCoeff * averageWeightDiff; // compatibility formula
    return this.compatibilityThreshold > compatibility;
  }

  /**
   * Add a player to the species
   * @param player
   */
  addToSpecies(player: Player) {
    this.players.push(player);
  }

  /**
   * Returns the number of excess and disjoint genes between the 2 input genomes
   * i.e. returns the number of genes which dont match
   * @param brain1
   * @param brain2
   */
  getExcessDisjoint(brain1: Genome, brain2: Genome) {
    var matching = 0.0;
    for (var i = 0; i < brain1.genes.length; i++) {
      for (var j = 0; j < brain2.genes.length; j++) {
        if (brain1.genes[i].innovationNo == brain2.genes[j].innovationNo) {
          matching++;
          break;
        }
      }
    }
    return brain1.genes.length + brain2.genes.length - 2 * matching; // return no of excess and disjoint genes
  }

  /**
   * returns the average weight difference between matching genes in the input genomes
   * @param brain1
   * @param brain2
   * @returns
   */
  averageWeightDiff(brain1: Genome, brain2: Genome) {
    if (brain1.genes.length == 0 || brain2.genes.length == 0) {
      return 0;
    }

    var matching = 0;
    var totalDiff = 0;
    for (var i = 0; i < brain1.genes.length; i++) {
      for (var j = 0; j < brain2.genes.length; j++) {
        if (brain1.genes[i].innovationNo == brain2.genes[j].innovationNo) {
          matching++;
          totalDiff += Math.abs(
            brain1.genes[i].weight - brain2.genes[j].weight
          );
          break;
        }
      }
    }
    if (matching == 0) {
      // divide by 0 error
      return 100;
    }
    return totalDiff / matching;
  }

  /**
   * Sorts the species by fitness
   * @returns
   */
  sortSpecies() {
    var temp: Player[] = [];

    // selection short
    for (var i = 0; i < this.players.length; i++) {
      var max = 0;
      var maxIndex = 0;
      for (var j = 0; j < this.players.length; j++) {
        if (this.players[j].fitness > max) {
          max = this.players[j].fitness;
          maxIndex = j;
        }
      }
      temp.push(this.players[maxIndex]);
      this.players.splice(maxIndex, 1);
      i--;
    }

    this.players = [...temp];
    if (this.players.length === 0) {
      this.staleness = 200;
      return;
    }

    // if new best player
    if (this.players[0].fitness > this.bestFitness) {
      this.staleness = 0;
      this.bestFitness = this.players[0].fitness;
      this.rep = this.players[0].brain.clone();
      this.champ = this.players[0].cloneForReplay();
    } else {
      // if no new best player
      this.staleness++;
    }
  }

  /**
   * Simple stuff
   */
  setAverage() {
    var sum = 0;
    for (var i = 0; i < this.players.length; i++) {
      sum += this.players[i].fitness;
    }
    this.averageFitness = sum / this.players.length;
  }

  /**
   * Gets baby from the this.players in this species
   * @param innovationHistory
   * @returns
   */
  giveMeBaby(innovationHistory: ConnectionHistory[]) {
    var baby: Player;
    if (random(1) < 0.25) {
      // 25% of the time there is no crossover and the child is simply a clone of a random(ish) player
      baby = this.selectPlayer().clone();
    } else {
      // 75% of the time do crossover
      // get 2 random(ish) parents
      var parent1 = this.selectPlayer();
      var parent2 = this.selectPlayer();

      // the crossover function expects the highest fitness parent to be the object and the lowest as the argument
      if (parent1.fitness < parent2.fitness) {
        baby = parent2.crossover(parent1);
      } else {
        baby = parent1.crossover(parent2);
      }
    }
    baby.brain.mutate(innovationHistory); // mutate that baby brain
    return baby;
  }

  /**
   * Selects a player based on it fitness
   */
  selectPlayer() {
    var fitnessSum = 0;
    for (var i = 0; i < this.players.length; i++) {
      fitnessSum += this.players[i].fitness;
    }
    var rand = random(fitnessSum);
    var runningSum = 0;

    for (var i = 0; i < this.players.length; i++) {
      runningSum += this.players[i].fitness;
      if (runningSum > rand) {
        return this.players[i];
      }
    }
    // unreachable code to make the parser happy
    return this.players[0];
  }

  /**
   * Kills off bottom half of the species
   */
  cull() {
    if (this.players.length > 2) {
      for (var i = this.players.length / 2; i < this.players.length; i++) {
        this.players.splice(i, 1);
        i--;
      }
    }
  }

  /**
   * In order to protect unique this.players, the fitnesses of each player is divided by the number of this.players in the species that that player belongs to
   */
  fitnessSharing() {
    for (var i = 0; i < this.players.length; i++) {
      this.players[i].fitness /= this.players.length;
    }
  }
}

export default Species;
