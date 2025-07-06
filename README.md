# VPNGate Backend Proxy

Node.js backend-прокси для получения списка серверов VPNGate (фильтрация по странам, CommonJS).

## Быстрый старт локально

```sh
npm install
node index.cjs
```

## Деплой на Railway
1. Загрузите этот репозиторий на GitHub.
2. На [railway.app](https://railway.app/) создайте новый проект и выберите этот репозиторий.
3. Railway сам определит Node.js и задеплоит backend.
4. Ваш API будет доступен по адресу:
   `https://<your-app>.up.railway.app/vpngate`

## Конфигурация
- Основной файл: `index.cjs`
- Зависимости: `package.json`
- .gitignore уже настроен

## Автор
Gozerr 