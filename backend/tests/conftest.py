import types
import sys

# Provide a light-weight stub for flask_limiter so integration tests run without the dependency.
if 'flask_limiter' not in sys.modules:
    limiter_mod = types.ModuleType('flask_limiter')

    class Limiter:  # noqa: D401 - simple stub
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs

        def limit(self, *_args, **_kwargs):
            def decorator(fn):
                return fn
            return decorator

    limiter_mod.Limiter = Limiter
    sys.modules['flask_limiter'] = limiter_mod

    util_mod = types.ModuleType('flask_limiter.util')
    util_mod.get_remote_address = lambda *_args, **_kwargs: '0.0.0.0'
    sys.modules['flask_limiter.util'] = util_mod
