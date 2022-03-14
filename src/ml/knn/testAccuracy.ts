import { create } from '@tensorflow-models/knn-classifier';
import { testClassifier, trainClassifier } from '.';

// Create the KNN classifier
const classifier = create();

trainClassifier(classifier).then(testClassifier);
