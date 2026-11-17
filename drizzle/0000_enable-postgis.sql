-- ADR-003: PostGIS para las consultas de cercanía de establecimientos.
-- En los equipos de desarrollo la extensión ya la crea el usuario postgres (README); en la CI el usuario es superusuario.
CREATE EXTENSION IF NOT EXISTS postgis;
