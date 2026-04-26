#!/usr/bin/env python3
"""
Health Risk Prediction Model Training
Trains ML model on Kaggle health risk dataset for real-time risk assessment
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import joblib
import os
from datetime import datetime

def load_and_preprocess_data(csv_path):
    """Load and preprocess the health risk dataset"""
    print("Loading dataset...")
    df = pd.read_csv(csv_path)

    print(f"Dataset shape: {df.shape}")
    print("Columns:", df.columns.tolist())
    print("\nSample data:")
    print(df.head())

    # Check for missing values
    print("\nMissing values:")
    print(df.isnull().sum())

    # Encode categorical variables
    le_consciousness = LabelEncoder()
    df['Consciousness_encoded'] = le_consciousness.fit_transform(df['Consciousness'])

    # Risk level mapping
    risk_mapping = {'Low': 0, 'Medium': 1, 'High': 2}
    df['Risk_Level_encoded'] = df['Risk_Level'].map(risk_mapping)

    # Features for training
    features = [
        'Respiratory_Rate', 'Oxygen_Saturation', 'O2_Scale', 'Systolic_BP',
        'Heart_Rate', 'Temperature', 'Consciousness_encoded', 'On_Oxygen'
    ]

    X = df[features]
    y = df['Risk_Level_encoded']

    print(f"\nFeatures: {features}")
    print(f"Target distribution: {df['Risk_Level'].value_counts()}")

    return X, y, features, risk_mapping

def train_model(X, y):
    """Train the Random Forest model"""
    print("\nTraining Random Forest model...")

    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Train model
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        class_weight='balanced'
    )

    model.fit(X_train_scaled, scaler, X_train, y_train)

    # Evaluate model
    y_pred = model.predict(X_test_scaled)

    print("Model Performance:")
    print(f"Accuracy: {accuracy_score(y_test, y_pred):.4f}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=['Low', 'Medium', 'High']))

    print("\nConfusion Matrix:")
    print(confusion_matrix(y_test, y_pred))

    # Cross-validation
    cv_scores = cross_val_score(model, X_train_scaled, y_train, cv=5)
    print(f"\nCross-validation scores: {cv_scores}")
    print(f"Mean CV score: {cv_scores.mean():.4f} (+/- {cv_scores.std() * 2:.4f})")

    return model, scaler, X_train.columns.tolist()

def save_model(model, scaler, features, risk_mapping, output_dir='backend/models'):
    """Save the trained model and preprocessing objects"""
    os.makedirs(output_dir, exist_ok=True)

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    model_data = {
        'model': model,
        'scaler': scaler,
        'features': features,
        'risk_mapping': risk_mapping,
        'trained_at': datetime.now().isoformat(),
        'version': '2.0.0'
    }

    model_path = os.path.join(output_dir, f'health_risk_model_{timestamp}.joblib')
    joblib.dump(model_data, model_path)

    print(f"\nModel saved to: {model_path}")

    # Also save latest version
    latest_path = os.path.join(output_dir, 'health_risk_model_latest.joblib')
    joblib.dump(model_data, latest_path)
    print(f"Latest model saved to: {latest_path}")

    return model_path

def main():
    """Main training pipeline"""
    csv_path = r"C:\Users\yusuf\Downloads\archive\Health_Risk_Dataset.csv"

    if not os.path.exists(csv_path):
        print(f"Error: Dataset not found at {csv_path}")
        print("Please download the dataset using:")
        print("kaggle datasets download ludocielbeckett/health-risk-prediction-anonymized-real-data")
        return

    # Load and preprocess data
    X, y, features, risk_mapping = load_and_preprocess_data(csv_path)

    # Train model
    model, scaler, feature_names = train_model(X, y)

    # Save model
    model_path = save_model(model, scaler, features, risk_mapping)

    print("\n🎉 Model training completed successfully!")
    print(f"Model saved at: {model_path}")
    print("\nTo use this model in production:")
    print("1. Deploy the model files to your server")
    print("2. Update the prediction service to load and use the model")
    print("3. Test the predictions with real patient data")

if __name__ == "__main__":
    main()