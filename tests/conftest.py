import sys
from pathlib import Path

# data/ n'est pas un package Python (pas de __init__.py), donc on l'ajoute
# au sys.path pour pouvoir faire `import predict` depuis les tests.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "data"))
