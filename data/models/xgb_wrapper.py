import numpy as np
from xgboost import XGBClassifier


class XGBMulticlassifier:
    """
    Wrapper XGBoost garantissant un output sur les 3 classes [0, 1, 2]
    même si le set d'entraînement n'en contient que 2.

    Le problème natif : XGBoost attend des labels 0-indexés sans gap.
    Si y_train = [1, 2] (pas de victoires domicile), il plante.
    Ce wrapper ré-encode y avant fit et ré-étale les probas après predict.
    """

    def __init__(self, **kwargs):
        self._params = kwargs
        self._clf = None
        self._train_classes = None

    def fit(self, X, y):
        self._train_classes = sorted(np.unique(y))
        class_map = {c: i for i, c in enumerate(self._train_classes)}
        y_enc = np.array([class_map[int(c)] for c in y])

        self._clf = XGBClassifier(
            num_class=len(self._train_classes),
            objective='multi:softprob',
            eval_metric='mlogloss',
            use_label_encoder=False,
            verbosity=0,
            **self._params,
        )
        self._clf.fit(X, y_enc)
        return self

    def predict_proba(self, X):
        """Retourne toujours une matrice (n, 3) pour les classes [0, 1, 2], normalisée."""
        proba_enc = self._clf.predict_proba(X)
        full_proba = np.zeros((len(X), 3))
        for enc_idx, orig_cls in enumerate(self._train_classes):
            full_proba[:, orig_cls] = proba_enc[:, enc_idx]
        # Normalisation : garantit que chaque ligne somme à 1.0
        row_sums = full_proba.sum(axis=1, keepdims=True)
        row_sums = np.where(row_sums == 0, 1, row_sums)
        return full_proba / row_sums

    @property
    def classes_(self):
        return np.array([0, 1, 2])
