<!-- connecter à la base de données:t
    python manage.py dbshell -->

    
Pour démarrer un serveur Redis sur le port 6379
    docker run --rm -p 6379:6379 redis:7

Exécuter migrate à l'intérieur du conteneur Django :
    docker-compose up -d  <!-- Démarre les conteneurs en arrière-plan -->
    docker exec -it django python manage.py migrate

python3 -c 'import channels; import daphne; print(channels.__version__, daphne.__version__)'

docker-compose down
docker-compose up --build

Supprimer les containers, les images et volumes existant (ce qui supprimera les données existantes de PostgreSQL) :
    docker-compose down -v
    docker image prune -a
    docker network prune

superuser
    mba
    mdp1234

utilisateur cree:   user1, motdepasse789
                    user2, motdepasse456
                    user3, motdepasse123

Arrêter tous les conteneurs en cours d'exécution
    docker stop $(docker ps -q)

Supprimer tous les conteneurs arrêtés
    docker rm $(docker ps -a -q)    

Arrêter et supprimer tous les conteneurs en une seule commande
    docker stop $(docker ps -q) && docker rm $(docker ps -a -q)



Connectez-vous au conteneur de la base de données:
    docker exec -it srcs-db-1 bash

Créez l'utilisateur et la base de données:
    psql -U postgres
    CREATE USER django WITH PASSWORD 'password1234';
    CREATE DATABASE django;
    GRANT ALL PRIVILEGES ON DATABASE django TO django;


Connecter un superutilisateur:
    docker exec -it srcs-web-1 python manage.py createsuperuser

Pour accéder au shell Django dans Docker:
    docker-compose exec web python manage.py shell


Arrêtez le service PostgreSQL local s'il tourne :
    sudo service postgresql stop

Migrations
    docker-compose exec web python manage.py makemigrations
    docker-compose exec web python manage.py migrate

Supprimer les messages chat
    docker exec -it srcs-db-1 bash
    psql -U postgres
    \l
    \c django
    \dt
    TRUNCATE chat_message CASCADE;
    TRUNCATE chat_gameinvite CASCADE;
    TRUNCATE chat_userprofile_blocked_users CASCADE;

