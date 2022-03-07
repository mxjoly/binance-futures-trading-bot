import { Binance, ExchangeInfo } from 'binance-api-node';
import ConnectionHistory from './connectionHistory';
import Player from './player';
import Species from './species';

class Population {
  private players: Player[];
  public bestPlayer: Player; // the best ever player
  private bestScore: number; // the score of the best ever player
  public globalBestScore: number;
  public generation: number; // Generation
  private innovationHistory: ConnectionHistory[];
  public generationPlayers: Player[];
  public species: Species[];

  private massExtinctionEvent: boolean;
  private newStage: boolean;

  constructor(
    size: number,
    genomePlayerInputs: number,
    genomePlayerOutputs: number,
    tradeConfig: TradeConfig,
    binanceClient: Binance,
    exchangeInfo: ExchangeInfo,
    initialCapital: number
  ) {
    this.players = [];
    this.bestPlayer;
    this.bestScore = 0;
    this.globalBestScore = 0;
    this.generation = 1;
    this.innovationHistory = [];
    this.generationPlayers = [];
    this.species = [];

    this.massExtinctionEvent = false;
    this.newStage = false;

    for (var i = 0; i < size; i++) {
      this.players.push(
        new Player(
          genomePlayerInputs,
          genomePlayerOutputs,
          tradeConfig,
          binanceClient,
          exchangeInfo,
          initialCapital
        )
      );
      this.players[this.players.length - 1].brain.mutate(
        this.innovationHistory
      );
      this.players[this.players.length - 1].brain.generateNetwork();
    }
  }

  /**
   * Update all the alive player
   */
  updateAlive(
    tradeConfig: TradeConfig,
    candles: CandleData[],
    currentPrice: number,
    indicatorsInputs: number[]
  ) {
    for (var i = 0; i < this.players.length; i++) {
      if (!this.players[i].dead) {
        this.players[i].look(candles, indicatorsInputs); // get inputs for brain
        this.players[i].think(); // use outputs from neural network
        this.players[i].update(tradeConfig, candles, currentPrice); // move the player according to the outputs from the neural network
        if (this.players[i].score > this.globalBestScore) {
          this.globalBestScore = this.players[i].score;
        }
      }
    }
  }

  /**
   * Returns true if all the players are dead
   */
  done() {
    for (var i = 0; i < this.players.length; i++) {
      if (!this.players[i].dead) {
        return false;
      }
    }
    return true;
  }

  /**
   * Sets the best player globally and for this generation
   */
  setBestPlayer() {
    var tempBest = this.species[0].players[0];
    tempBest.generation = this.generation;

    // if the best of this gen is better than the global best score then set the global best as the best gen
    if (tempBest.score >= this.bestScore) {
      this.generationPlayers.push(tempBest.cloneForReplay());
      this.bestScore = tempBest.score;
      this.bestPlayer = tempBest.cloneForReplay();
    }
  }

  /**
   * This function is called when all the players are dead and a new generation needs to be made
   */
  naturalSelection() {
    var previousBest = this.players[0];
    this.speciate(); // separate the players from species
    this.calculateFitness(); // calculate the fitness of each player
    this.sortSpecies(); // sort the species to be ranked in fitness order, best first
    if (this.massExtinctionEvent) {
      this.massExtinction();
      this.massExtinctionEvent = false;
    }
    this.cullSpecies(); // kill off the bottom half of each species
    this.setBestPlayer(); // save the best player of this generation
    this.killStaleSpecies(); // remove species which haven't improved in the last 15(ish) generations
    this.killBadSpecies(); // kill species which are so bad that they cant reproduce

    var averageSum = this.getAvgFitnessSum();

    var children: Player[] = [];
    for (var j = 0; j < this.species.length; j++) {
      // for each this.species
      children.push(this.species[j].champ.clone()); // add champion without any mutation
      var NoOfChildren =
        Math.floor(
          (this.species[j].averageFitness / averageSum) * this.players.length
        ) - 1; // the number of children this species is allowed, note -1 is because the champ is already added
      for (var i = 0; i < NoOfChildren; i++) {
        // get the calculated amount of children from this species
        children.push(this.species[j].giveMeBaby(this.innovationHistory));
      }
    }

    if (children.length < this.players.length) {
      children.push(previousBest.clone());
    }

    while (children.length < this.players.length) {
      // if not enough babies (due to flooring the number of children to get a whole var)
      children.push(this.species[0].giveMeBaby(this.innovationHistory)); // get babies from the best species
    }

    this.players = [];
    this.players = [...children]; // set the children as the current player
    this.generation++;
    for (var i = 0; i < this.players.length; i++) {
      // generate networks for each of the children
      this.players[i].brain.generateNetwork();
    }
  }

  /**
   * Separate players into species based on how similar they are to the leaders of each species in the previous generation
   */
  speciate() {
    for (var s of this.species) {
      // empty species
      s.players = [];
    }
    for (var i = 0; i < this.players.length; i++) {
      // for each player
      var speciesFound = false;
      for (var s of this.species) {
        // for each this.species
        if (s.sameSpecies(this.players[i].brain)) {
          // if the player is similar enough to be considered in the same species
          s.addToSpecies(this.players[i]); // add it to the species
          speciesFound = true;
          break;
        }
      }
      if (!speciesFound) {
        // if no species was similar enough then add a new species with this as its champion
        this.species.push(new Species(this.players[i]));
      }
    }
  }

  /**
   * Calculates the fitness of all of the players
   */
  calculateFitness() {
    for (var i = 1; i < this.players.length; i++) {
      this.players[i].calculateFitness();
    }
  }

  /**
   * Sorts the players within a species and the species by their fitnesses
   */
  sortSpecies() {
    // sort the players within a species
    for (var s of this.species) {
      s.sortSpecies();
    }

    // sort the species by the fitness of its best player using selection sort like a loser
    var temp: Species[] = [];
    for (var i = 0; i < this.species.length; i++) {
      var max = 0;
      var maxIndex = 0;
      for (var j = 0; j < this.species.length; j++) {
        if (this.species[j].bestFitness > max) {
          max = this.species[j].bestFitness;
          maxIndex = j;
        }
      }
      temp.push(this.species[maxIndex]);
      this.species.splice(maxIndex, 1);
      i--;
    }
    this.species = [];
    this.species = [...temp];
  }

  /**
   * kills all species which haven't improved in 15 generations
   */
  killStaleSpecies() {
    for (var i = 2; i < this.species.length; i++) {
      if (this.species[i].staleness >= 15) {
        this.species.splice(i, 1);
        i--;
      }
    }
  }

  /**
   * if a species sucks so much that it wont even be allocated 1 child for the next generation then kill it now
   */
  killBadSpecies() {
    var averageSum = this.getAvgFitnessSum();
    for (var i = 1; i < this.species.length; i++) {
      if (
        (this.species[i].averageFitness / averageSum) * this.players.length <
        1
      ) {
        // if wont be given a single child
        this.species.splice(i, 1);
        i--;
      }
    }
  }

  /**
   * Returns the sum of each this.species average fitness
   */
  getAvgFitnessSum() {
    var averageSum = 0;
    for (var s of this.species) {
      averageSum += s.averageFitness;
    }
    return averageSum;
  }

  /**
   * Kill the bottom half of each species
   */
  cullSpecies() {
    for (var s of this.species) {
      s.cull(); // kill bottom half
      s.fitnessSharing(); // also while we're at it lets do fitness sharing
      s.setAverage(); // reset averages because they will have changed
    }
  }

  massExtinction() {
    for (var i = 5; i < this.species.length; i++) {
      this.species.splice(i, 1);
      i--;
    }
  }
}

export default Population;
