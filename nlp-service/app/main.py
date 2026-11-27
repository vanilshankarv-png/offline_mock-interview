from fastapi import FastAPI

from app.core.models import lifespan
from app.routers.nlp import router


app = FastAPI(title="TalkReady NLP Service", lifespan=lifespan)
app.include_router(router, prefix="/nlp")
