import { create } from '@tensorflow-models/knn-classifier';
import { trainClassifier } from '.';

// Use the dataset saved previously ?
const useSave = process.argv[2]
  ? process.argv[2].split('=')[1] === 'true'
    ? true
    : false
  : false;

const classifier = create();

trainClassifier(classifier, useSave).then(() => {
  console.log('Ready to get new predictions!');
});
