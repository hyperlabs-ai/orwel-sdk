#!/bin/bash

# Script para linkear el SDK con el proyecto SaaS usando yalc
# Ejecutar desde el directorio orwel-sdk

echo "🔨 Construyendo SDK..."
npm run build

echo "📦 Publicando en yalc..."
yalc publish

echo "🔗 Actualizando link en el proyecto SaaS..."
cd ../orwel
yalc update orwel
npm install

echo "✅ SDK linkeado exitosamente!"
echo "📌 Puedes iniciar el dev server en el SaaS con: npm run dev"
