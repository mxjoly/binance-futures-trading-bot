type DataSet = Array<{
  features: any; // X
  target: Target; // y - labels
}>;

type PredictionResults = {
  label: string;
  classIndex: number;
  confidences: {
    [label: string]: number;
  };
};
