from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import geocode_router, router
from app.services.point_search import PointSearchService


def create_app(point_service=None) -> FastAPI:
    app = FastAPI(
        title="InPost Smart Point Finder API",
        description="Ranks InPost points by fit for a user's parcel workflow.",
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.point_service = point_service or PointSearchService()
    app.include_router(router)
    app.include_router(geocode_router)
    return app


app = create_app()
