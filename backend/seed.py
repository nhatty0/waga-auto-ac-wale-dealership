from database import SessionLocal, engine, Base
import models

Base.metadata.create_all(bind=engine)
db = SessionLocal()

# Check if cars already exist
if db.query(models.Vehicle).count() == 0:
    sample_cars = [
        {
            "make": "Toyota",
            "model": "Land Cruiser LC300 VXR",
            "year": 2024,
            "price": 28500000,
            "mileage": 1200,
            "condition": "Brand New",
            "fuel_type": "Gasoline",
            "transmission": "10-Speed Automatic",
            "body_type": "SUV",
            "engine_size": "3.5L Twin-Turbo V6",
            "drive_train": "4WD",
            "exterior_color": "Pearl White",
            "customs_cleared": True,
            "features": "Cool Box, JBL Premium Sound, Sunroof, 360 Camera, Adaptive Cruise",
            "description": "Top-of-the-line LC300 VXR with zero mileage on local roads. Complete import clearance documents ready.",
            "status": models.VehicleStatus.AVAILABLE,
            "images": [
                "https://images.unsplash.com/photo-1594502184342-2e12f877aa73?auto=format&fit=crop&w=1200&q=80",
                "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=1200&q=80"
            ]
        },
        {
            "make": "Mercedes-Benz",
            "model": "G63 AMG Biturbo",
            "year": 2023,
            "price": 38000000,
            "mileage": 9400,
            "condition": "Excellent Condition",
            "fuel_type": "Gasoline",
            "transmission": "9G-Tronic AMG",
            "body_type": "SUV",
            "engine_size": "4.0L Handcrafted V8",
            "drive_train": "AWD",
            "exterior_color": "Obsidian Black",
            "customs_cleared": True,
            "features": "Burmester Surround Sound, Red Nappa Leather, Carbon Fiber Trim, Side Exhausts",
            "description": "Mint condition G-Wagon directly imported from Dubai. Fully inspected and pristine mechanical condition.",
            "status": models.VehicleStatus.AVAILABLE,
            "images": [
                "https://images.unsplash.com/photo-1520050206274-a1ae44613e6d?auto=format&fit=crop&w=1200&q=80",
                "https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=1200&q=80"
            ]
        },
        {
            "make": "Hyundai",
            "model": "Kona EV Limited",
            "year": 2023,
            "price": 8200000,
            "mileage": 14000,
            "condition": "Excellent Condition",
            "fuel_type": "Electric",
            "transmission": "Single-Speed Direct",
            "body_type": "Crossover",
            "engine_size": "150 kW Electric Motor (415 km range)",
            "drive_train": "FWD",
            "exterior_color": "Chalk White",
            "customs_cleared": True,
            "features": "Regenerative Braking Paddles, Wireless Apple CarPlay, Heated Seats, Lane Keep Assist",
            "description": "High-efficiency pure electric SUV with low charging cost. Comes with 7kW home charging kit.",
            "status": models.VehicleStatus.AVAILABLE,
            "images": [
                "https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=1200&q=80"
            ]
        }
    ]

    for car_item in sample_cars:
        images = car_item.pop("images")
        v = models.Vehicle(**car_item)
        db.add(v)
        db.commit()
        db.refresh(v)
        for idx, img_url in enumerate(images):
            db.add(models.VehicleImage(vehicle_id=v.id, image_url=img_url, is_cover=(idx == 0), display_order=idx))
        db.commit()

    print("✅ Sample vehicles seeded successfully!")
else:
    print("Database already contains data.")

db.close()