# class diagram

update twitter config

```sequenceDiagram
    participant User
    participant Core
    participant ClientTwitter

    User ->> Core: update twitter client
    Core ->> Core: get http proxy of the agent
    Core ->> ClientTwitter: start twitter client with the http proxy
    ClientTwitter ->> ClientTwitter: start twitter client
    ClientTwitter ->> Core: twitter client started
    loop Every 5 minute
        ClientTwitter ->> ClientTwitter: execute the action or not
    end
    Core ->> User: twitter client started

    User ->> Core: stop twitter client
```
