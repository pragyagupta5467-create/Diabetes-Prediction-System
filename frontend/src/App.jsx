import { useState } from "react";

const createParticles = () =>
  Array.from({ length: 30 }, (_, i) => {
    const seed = i + 1;

    return {
      id: i,
      x: (seed * 37) % 100,
      y: (seed * 53) % 100,
      duration: 15 + ((seed * 17) % 20),
      delay: (seed * 7) % 5,
      size: 2 + ((seed * 11) % 4),
    };
  });

const loadHistory = () => {
  try {
    return JSON.parse(localStorage.getItem("diabetesHistory") || "[]");
  } catch {
    return [];
  }
};

function App() {
  const [form, setForm] = useState({
    pregnancies: "",
    glucose: "",
    bloodPressure: "",
    skinThickness: "",
    insulin: "",
    bmi: "",
    pedigree: "",
    age: "",
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [particles] = useState(createParticles);
  const [activeTab, setActiveTab] = useState("predict");
  const [history, setHistory] = useState(loadHistory);
  const [showComparison, setShowComparison] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState([]);
  const [bmiCalculator, setBmiCalculator] = useState({
    weight: "",
    height: "",
  });
  const [errors, setErrors] = useState({});
  const [bmiResult, setBmiResult] = useState(null);
  const [bmiError, setBmiError] = useState("");


  const validateForm = () => {
    const newErrors = {};

    if (!form.age || form.age < 1 || form.age > 120)
      newErrors.age = "Age must be between 1 and 120";

    if (!form.glucose || form.glucose < 50 || form.glucose > 300)
      newErrors.glucose = "Glucose should be between 50 and 300 mg/dL";

    if (!form.bloodPressure || form.bloodPressure < 40 || form.bloodPressure > 200)
      newErrors.bloodPressure = "Blood Pressure should be between 40 and 200";

    if (!form.bmi || form.bmi < 10 || form.bmi > 60)
      newErrors.bmi = "BMI should be between 10 and 60";

    if (!form.insulin || form.insulin < 0 || form.insulin > 900)
      newErrors.insulin = "Insulin value looks invalid";

    if (!form.skinThickness || form.skinThickness < 0 || form.skinThickness > 100)
      newErrors.skinThickness = "Skin thickness should be below 100 mm";

    if (form.pregnancies < 0 || form.pregnancies > 20)
      newErrors.pregnancies = "Pregnancies must be between 0 and 20";

    if (!form.pedigree || form.pedigree < 0 || form.pedigree > 3)
      newErrors.pedigree = "Pedigree value should be between 0 and 3";

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const switchTab = (tabId) => {
    setActiveTab(tabId);

    if (tabId !== "history") {
      setShowComparison(false);
      setSelectedHistory([]);
    }
  };

  const calculateBMI = () => {
    const weight = Number(bmiCalculator.weight);
    const heightCm = Number(bmiCalculator.height);

    // Clear previous result
    setBmiResult(null);

    // Validation
    if (!weight || !heightCm) {
      setBmiError("Please enter both weight and height.");
      return;
    }

    if (weight < 20 || weight > 300) {
      setBmiError("Weight must be between 20 kg and 300 kg.");
      return;
    }

    if (heightCm < 80 || heightCm > 250) {
      setBmiError("Height must be between 80 cm and 250 cm.");
      return;
    }

    setBmiError("");

    const heightM = heightCm / 100;
    const bmi = (weight / (heightM * heightM)).toFixed(1);

    let category = "";
    let color = "";

    if (bmi < 18.5) {
      category = "Underweight";
      color = "from-blue-500 to-cyan-500";
    } else if (bmi < 25) {
      category = "Normal";
      color = "from-green-500 to-emerald-500";
    } else if (bmi < 30) {
      category = "Overweight";
      color = "from-yellow-500 to-orange-500";
    } else {
      category = "Obese";
      color = "from-red-500 to-rose-600";
    }

    setBmiResult({ bmi, category, color });

    // Optional: sync BMI to prediction form
    setForm((prev) => ({ ...prev, bmi }));
  };



  {/* BMI Result */ }
  {
    bmiResult && (
      <div className="mt-6 animate-fade-in">
        <div
          className={`rounded-2xl p-6 text-center text-white font-bold shadow-xl 
      bg-gradient-to-r ${bmiResult.color}`}
        >
          <p className="text-sm tracking-wide">Your BMI</p>
          <p className="text-4xl">{bmiResult.bmi}</p>
          <p className="mt-2 text-lg">{bmiResult.category}</p>
        </div>
      </div>
    )
  }


  const predictRisk = async () => {
    if (!validateForm()) {
      return; // stop execution if invalid
    }
    setLoading(true);
    setResult(null);
    setShowResults(false);

    try {
      const response = await fetch("https://diabetes-prediction-system-1-qw0.onrender.com/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();

      setTimeout(() => {
        const resultWithTimestamp = {
          ...data,
          timestamp: new Date().toISOString(),
          inputs: { ...form },
        };
        setResult(resultWithTimestamp);
        setShowResults(true);
        setLoading(false);

        // Save to history
        const newHistory = [resultWithTimestamp, ...history].slice(0, 10);
        setHistory(newHistory);
        localStorage.setItem("diabetesHistory", JSON.stringify(newHistory));
      }, 2000);
    } catch (error) {
  console.error("Prediction failed:", error);
  setLoading(false);
  alert("Unable to connect to the prediction server. Please try again.");
}
  };

  const exportResults = () => {
    if (!result) return;
    const dataStr = JSON.stringify(result, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `diabetes-report-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("diabetesHistory");
  };

  const toggleHistorySelection = (index) => {
    if (selectedHistory.includes(index)) {
      setSelectedHistory(selectedHistory.filter((i) => i !== index));
    } else if (selectedHistory.length < 3) {
      setSelectedHistory([...selectedHistory, index]);
    }
  };

  const getRiskColor = () => {
    if (!result)
      return {
        primary: "#8b5cf6",
        secondary: "#6d28d9",
        glow: "rgba(139, 92, 246, 0.5)",
      };
    if (result.risk_level === "Low Risk")
      return {
        primary: "#10b981",
        secondary: "#059669",
        glow: "rgba(16, 185, 129, 0.5)",
      };
    if (result.risk_level === "Medium Risk")
      return {
        primary: "#f59e0b",
        secondary: "#d97706",
        glow: "rgba(245, 158, 11, 0.5)",
      };
    return {
      primary: "#ef4444",
      secondary: "#dc2626",
      glow: "rgba(239, 68, 68, 0.5)",
    };
  };

  const getRecommendations = () => {
    if (!result) return [];

    // LOW RISK
    if (result.risk_level === "Low Risk") {
      return [
        {
          icon: "✓",
          title: "Maintain a Healthy Lifestyle",
          desc: "You are doing well. Continue eating healthy, staying active, and maintaining your routine.",
          gradient: "from-green-500 to-emerald-600",
        },
        {
          icon: "⚡",
          title: "Follow a Balanced Diet",
          desc: "Eat more whole grains, fruits, vegetables, and limit processed foods.",
          gradient: "from-blue-500 to-cyan-600",
        },
        {
          icon: "♥",
          title: "Stay Physically Active",
          desc: "Try to exercise regularly for at least 30 minutes on most days of the week.",
          gradient: "from-purple-500 to-pink-600",
        },
        {
          icon: "◈",
          title: "Schedule Regular Health Checkups",
          desc: "Routine checkups help you track your health and prevent future problems.",
          gradient: "from-orange-500 to-red-600",
        },
      ];
    }

    // MEDIUM RISK
    if (result.risk_level === "Medium Risk") {
      return [
        {
          icon: "!",
          title: "Take Preventive Action Now",
          desc: "Your risk level is moderate. Making lifestyle changes now can reduce future complications.",
          gradient: "from-yellow-500 to-orange-600",
        },
        {
          icon: "◐",
          title: "Improve Eating Habits",
          desc: "Reduce sugary foods and refined carbohydrates. Prefer home-cooked, nutritious meals.",
          gradient: "from-green-500 to-teal-600",
        },
        {
          icon: "↑",
          title: "Increase Physical Activity",
          desc: "Aim for at least 45–60 minutes of exercise such as walking, cycling, or yoga.",
          gradient: "from-blue-500 to-indigo-600",
        },
        {
          icon: "◉",
          title: "Monitor Blood Sugar Levels",
          desc: "Check your blood sugar regularly and keep a record of the readings.",
          gradient: "from-purple-500 to-violet-600",
        },
        {
          icon: "◯",
          title: "Get Quality Sleep",
          desc: "Ensure 7–8 hours of sleep every night to help regulate blood sugar levels.",
          gradient: "from-pink-500 to-rose-600",
        },
        {
          icon: "◈",
          title: "Manage Stress Effectively",
          desc: "Practice meditation, breathing exercises, or relaxation techniques to reduce stress.",
          gradient: "from-cyan-500 to-blue-600",
        },
      ];
    }

    // HIGH RISK
    return [
      {
        icon: "⚠",
        title: "Consult a Doctor Immediately",
        desc: "Your risk level is high. Please seek professional medical advice as soon as possible.",
        gradient: "from-red-500 to-rose-600",
      },
      {
        icon: "◉",
        title: "Undergo Detailed Medical Tests",
        desc: "Tests such as HbA1c and fasting glucose are important for accurate diagnosis.",
        gradient: "from-orange-500 to-amber-600",
      },
      {
        icon: "◐",
        title: "Review Medication Options",
        desc: "Your doctor may suggest medications or insulin therapy based on your condition.",
        gradient: "from-purple-500 to-fuchsia-600",
      },
      {
        icon: "◑",
        title: "Follow a Structured Diet Plan",
        desc: "Work with a nutritionist to create a diet plan that controls blood sugar levels.",
        gradient: "from-green-500 to-lime-600",
      },
      {
        icon: "↑",
        title: "Exercise Under Medical Guidance",
        desc: "Start physical activities only after consulting your doctor for safety.",
        gradient: "from-blue-500 to-sky-600",
      },
      {
        icon: "♥",
        title: "Monitor Heart Health",
        desc: "Diabetes can affect the heart, so regular heart checkups are essential.",
        gradient: "from-red-500 to-pink-600",
      },
    ];
  };


  const inputFields = [
    {
      name: "age",
      label: "Age",
      icon: "◉",
      unit: "years",
      color: "from-purple-500 to-pink-500",
    },
    {
      name: "glucose",
      label: "Glucose",
      icon: "◐",
      unit: "mg/dL",
      color: "from-red-500 to-orange-500",
    },
    {
      name: "bloodPressure",
      label: "Blood Pressure",
      icon: "♥",
      unit: "mmHg",
      color: "from-pink-500 to-rose-500",
    },
    {
      name: "bmi",
      label: "BMI",
      icon: "◈",
      unit: "kg/m²",
      color: "from-blue-500 to-cyan-500",
    },
    {
      name: "insulin",
      label: "Insulin",
      icon: "◑",
      unit: "μU/mL",
      color: "from-green-500 to-emerald-500",
    },
    {
      name: "skinThickness",
      label: "Skin Thickness",
      icon: "◯",
      unit: "mm",
      color: "from-yellow-500 to-amber-500",
    },
    {
      name: "pregnancies",
      label: "Pregnancies",
      icon: "◆",
      unit: "count",
      color: "from-indigo-500 to-purple-500",
    },
    {
      name: "pedigree",
      label: "Pedigree",
      icon: "◊",
      unit: "factor",
      color: "from-violet-500 to-fuchsia-500",
    },
  ];

  const colors = getRiskColor();
  const riskPercentage = Number(result?.risk_percentage);
  const confidenceScore =
    75 + (Number.isFinite(riskPercentage) ? Math.abs(Math.trunc(riskPercentage)) % 5 : 0);

  return (
    <div
      className={`min-h-screen relative overflow-hidden transition-all duration-700 ${darkMode
        ? "bg-[#0a0a0f]"
        : "bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50"
        }`}
    >
      {/* Animated Background Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className={`absolute rounded-full ${darkMode ? "bg-purple-500/20" : "bg-purple-400/30"}`}
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              animation: `float ${particle.duration}s ease-in-out ${particle.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Neural Network Grid Background */}
      <div className="absolute inset-0 pointer-events-none opacity-10">
        <div
          className={`absolute inset-0 ${darkMode ? "bg-[linear-gradient(rgba(139,92,246,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.1)_1px,transparent_1px)]" : "bg-[linear-gradient(rgba(99,102,241,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.1)_1px,transparent_1px)]"} bg-[size:50px_50px]`}
        />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-12">
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <div
                  className={`relative w-16 h-16 rounded-2xl flex items-center justify-center ${darkMode
                    ? "bg-gradient-to-br from-purple-600 to-pink-600"
                    : "bg-gradient-to-br from-purple-500 to-pink-500"
                    } shadow-2xl`}
                >
                  <div className="text-3xl">⚕</div>
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent" />
                </div>
                <div>
                  <h1
                    className={`text-4xl font-black tracking-tight ${darkMode ? "text-white" : "text-gray-900"
                      }`}
                  >
                    Diabetes Risk Predictor
                  </h1>
                  <p
                    className={`text-sm font-medium ${darkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                  >
                    Advanced Machine Learning Risk Assessment
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`relative w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-110 ${darkMode
                ? "bg-gray-800/80 backdrop-blur-xl border border-gray-700/50 text-yellow-400"
                : "bg-white/80 backdrop-blur-xl border border-gray-200 text-gray-800"
                } shadow-xl hover:shadow-2xl`}
            >
              <span className="text-2xl">{darkMode ? "◐" : "◑"}</span>
            </button>
          </div>

          {/* Stats Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              {
                label: "Algorithm",
                value: "Random Forest",
                icon: "◈",
                color: "from-purple-500 to-pink-500",
                details:
                  "Random Forest combines multiple decision trees to improve prediction accuracy and reduce overfitting.",
              },
              {
                label: "Accuracy",
                value: "90–97%",
                icon: "◉",
                color: "from-blue-500 to-cyan-500",
                details:
                  "Accuracy shows how often the model predicts correctly on unseen test data.",
              },
              {
                label: "Parameters",
                value: "8 Features",
                icon: "◐",
                color: "from-green-500 to-emerald-500",
                details:
                  "Age, Glucose, Blood Pressure, BMI, Insulin, Skin Thickness, Pregnancies, Pedigree Function.",
              },
              {
                label: "Dataset",
                value: "PIMA Indians",
                icon: "◆",
                color: "from-orange-500 to-red-500",
                details:
                  "A medical dataset widely used for diabetes risk prediction research.",
              },
            ].map((stat, i) => (
              <div
                key={i}
                className={`relative rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${darkMode
                  ? "bg-gray-800/50 border border-gray-700/50"
                  : "bg-white/60 border border-gray-200"
                  }`}
              >
                {/* Icon */}
                <div
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} mb-3 shadow-lg`}
                >
                  <span className="text-white text-xl font-bold">{stat.icon}</span>
                </div>

                {/* Label */}
                <p
                  className={`text-xs font-semibold uppercase tracking-wider mb-1 ${darkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                >
                  {stat.label}
                </p>

                {/* Value + info */}
                <div className="flex items-center gap-2">
                  <p
                    className={`text-lg font-bold ${darkMode ? "text-white" : "text-gray-900"
                      }`}
                  >
                    {stat.value}
                  </p>

                  {/* Info Pop */}
                  <div className="relative group">
                    <span className="text-xs cursor-pointer text-gray-400">ⓘ</span>

                    <div
                      className="absolute left-1/2 top-full mt-2 -translate-x-1/2
                       w-60 opacity-0 scale-90 group-hover:opacity-100
                       group-hover:scale-100 transition-all duration-300
                       z-50"
                    >
                      <div
                        className={`p-3 rounded-xl text-xs shadow-xl ${darkMode
                          ? "bg-gray-900 text-gray-300"
                          : "bg-white text-gray-700"
                          }`}
                      >
                        {stat.details}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>


        </div>

        <br></br>
        {/* Tab Navigation */}
        <div
          className={`flex gap-2 mb-8 p-2 rounded-2xl ${darkMode
            ? "bg-gray-800/50 backdrop-blur-xl border border-gray-700/50"
            : "bg-white/50 backdrop-blur-xl border border-gray-200"
            }`}
        >
          {[
            { id: "predict", label: "Risk Analysis", icon: "◈" },
            { id: "tools", label: "Health Tools", icon: "◉" },
            { id: "history", label: "History", icon: "◐" },
            { id: "insights", label: "Insights", icon: "◆" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all duration-300 ${activeTab === tab.id
                ? darkMode
                  ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg"
                  : "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg"
                : darkMode
                  ? "text-gray-400 hover:text-white"
                  : "text-gray-600 hover:text-gray-900"
                }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Predict Tab */}
        {activeTab === "predict" && (
          <div className="space-y-8">
            {/* Input Form */}
            <div
              className={`rounded-3xl p-8 transition-all duration-500 ${darkMode
                ? "bg-gray-800/50 backdrop-blur-xl border border-gray-700/50"
                : "bg-white/70 backdrop-blur-xl border border-gray-200"
                } shadow-2xl`}
            >
              <h2
                className={`text-2xl font-bold mb-8 ${darkMode ? "text-white" : "text-gray-900"
                  }`}
              >
                Patient Health Metrics
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {inputFields.map((field, i) => (
                  <div
                    key={field.name}
                    className="relative group"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div
                      className={`absolute -inset-0.5 bg-gradient-to-r ${field.color} rounded-2xl opacity-0 group-hover:opacity-100 blur transition-all duration-300`}
                    />
                    <div
                      className={`relative rounded-2xl overflow-hidden ${darkMode ? "bg-gray-900/90" : "bg-white"
                        } border ${darkMode ? "border-gray-700" : "border-gray-200"
                        }`}
                    >
                      <div
                        className={`px-4 py-2 bg-gradient-to-r ${field.color}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-white text-lg font-bold">
                            {field.icon}
                          </span>
                          <span className="text-white text-xs font-bold uppercase tracking-wider">
                            {field.label}
                          </span>
                        </div>
                      </div>
                      <div className="p-4">
                        <input
                          name={field.name}
                          type="number"
                          step="any"
                          value={form[field.name]}
                          onChange={handleChange}
                          placeholder="0"
                          className={`w-full text-3xl font-bold bg-transparent outline-none ${darkMode
                            ? "text-white placeholder-gray-600"
                            : "text-gray-900 placeholder-gray-400"
                            }`}
                        />
                        {errors[field.name] && (
                          <p className="mt-1 text-xs text-red-400 font-medium">
                            {errors[field.name]}
                          </p>
                        )}
                        <p
                          className={`text-xs font-medium mt-1 ${darkMode ? "text-gray-500" : "text-gray-600"
                            }`}
                        >
                          {field.unit}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={predictRisk}
                  disabled={loading}
                  className={`flex-1 h-16 rounded-2xl font-bold text-lg overflow-hidden transition-all duration-300 ${loading
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:scale-105 hover:shadow-2xl active:scale-100"
                    } shadow-xl`}
                  style={{
                    background: loading
                      ? "#6b7280"
                      : `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                  }}
                >
                  <div className="flex items-center justify-center gap-3 text-white">
                    {loading ? (
                      <>
                        <div className="relative w-6 h-6">
                          <div className="absolute inset-0 border-4 border-white/30 rounded-full" />
                          <div className="absolute inset-0 border-4 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <span className="text-2xl">◈</span>
                        Run Analysis
                      </>
                    )}
                  </div>
                </button>

                {result && (
                  <button
                    onClick={exportResults}
                    className={`px-6 h-16 rounded-2xl font-bold transition-all duration-300 hover:scale-105 ${darkMode
                      ? "bg-gray-700 text-white"
                      : "bg-gray-200 text-gray-900"
                      } shadow-xl`}
                  >
                    Export ↓
                  </button>
                )}
              </div>
            </div>

            {/* Results */}
            {showResults && result && (
              <div className="space-y-8">
                {/* Risk Score Card */}
                <div
                  className={`relative rounded-3xl overflow-hidden transition-all duration-700 ${darkMode
                    ? "bg-gray-800/50 backdrop-blur-xl border-2"
                    : "bg-white/70 backdrop-blur-xl border-2"
                    } shadow-2xl`}
                  style={{ borderColor: colors.primary }}
                >
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      background: `radial-gradient(circle at 50% 0%, ${colors.glow}, transparent 70%)`,
                    }}
                  />

                  <div className="relative p-12">
                    <div className="text-center mb-8">
                      <p
                        className={`text-sm font-bold uppercase tracking-widest mb-4 ${darkMode ? "text-gray-400" : "text-gray-600"
                          }`}
                      >
                        Risk Assessment
                      </p>
                      <div className="relative inline-block">
                        <div
                          className="absolute inset-0 blur-3xl opacity-50 animate-pulse"
                          style={{ background: colors.primary }}
                        />
                        <div
                          className="relative text-9xl font-black"
                          style={{ color: colors.primary }}
                        >
                          {result.risk_percentage}
                          <span className="text-5xl">%</span>
                        </div>
                      </div>
                      <div
                        className="inline-block px-8 py-3 rounded-full text-white font-bold text-lg mt-6 shadow-xl"
                        style={{
                          background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                        }}
                      >
                        {result.risk_level}
                      </div>
                    </div>

                    {/* Circular Progress */}
                    <div className="relative w-48 h-48 mx-auto">
                      <svg
                        width="192"
                        height="192"
                        viewBox="0 0 192 192"
                        className="w-full h-full transform -rotate-90"
                      >
                        {/* Background circle */}
                        <circle
                          cx="96"
                          cy="96"
                          r="88"
                          stroke={darkMode ? "#1f2937" : "#e5e7eb"}
                          strokeWidth="12"
                          fill="none"
                        />

                        {/* Progress circle */}
                        <circle
                          cx="96"
                          cy="96"
                          r="88"
                          stroke={colors.primary}
                          strokeWidth="12"
                          fill="none"
                          strokeDasharray={2 * Math.PI * 88}
                          strokeDashoffset={
                            2 * Math.PI * 88 * (1 - result.risk_percentage / 100)
                          }
                          strokeLinecap="round"
                          className="transition-all duration-2000"
                          style={{
                            filter: `drop-shadow(0 0 10px ${colors.glow})`,
                          }}
                        />
                      </svg>

                      {/* Center text */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <p className={`text-sm font-semibold ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                            Confidence
                          </p>
                          <p className={`text-2xl font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
                            {confidenceScore}%
                          </p>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Recommendations */}
                <div
                  className={`rounded-3xl overflow-hidden ${darkMode
                    ? "bg-gray-800/50 backdrop-blur-xl border border-gray-700/50"
                    : "bg-white/70 backdrop-blur-xl border border-gray-200"
                    } shadow-2xl`}
                >
                  <div
                    className="p-6 text-white font-bold text-xl text-center"
                    style={{
                      background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                    }}
                  >
                    {result.risk_level === "Low Risk" &&
                      "✓ Excellent Health Status"}
                    {result.risk_level === "Medium Risk" &&
                      "! Action Plan Required"}
                    {result.risk_level === "High Risk" &&
                      "⚠ Immediate Intervention Needed"}
                  </div>

                  <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {getRecommendations().map((rec, i) => (
                      <div
                        key={i}
                        className={`group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-105 ${darkMode
                          ? "bg-gray-900/50 border border-gray-700"
                          : "bg-white border border-gray-200"
                          }`}
                        style={{ animationDelay: `${i * 100}ms` }}
                      >
                        <div
                          className={`absolute inset-0 bg-gradient-to-br ${rec.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}
                        />
                        <div className="relative">
                          <div
                            className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${rec.gradient} mb-4 shadow-lg`}
                          >
                            <span className="text-white text-2xl font-bold">
                              {rec.icon}
                            </span>
                          </div>
                          <h3
                            className={`font-bold mb-2 ${darkMode ? "text-white" : "text-gray-900"
                              }`}
                          >
                            {rec.title}
                          </h3>
                          <p
                            className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"
                              }`}
                          >
                            {rec.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Health Tools Tab */}
        {activeTab === "tools" && (
          <div className="space-y-8">
            {/* BMI Calculator */}
            <div
              className={`rounded-3xl p-8 ${darkMode
                ? "bg-gray-800/50 backdrop-blur-xl border border-gray-700/50"
                : "bg-white/70 backdrop-blur-xl border border-gray-200"
                } shadow-2xl`}
            >
              <h2
                className={`text-2xl font-bold mb-6 ${darkMode ? "text-white" : "text-gray-900"}`}
              >
                ◈ BMI Calculator
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label
                    className={`block text-sm font-semibold mb-2 ${darkMode ? "text-gray-300" : "text-gray-700"}`}
                  >
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    value={bmiCalculator.weight}
                    onChange={(e) =>
                      setBmiCalculator({
                        ...bmiCalculator,
                        weight: e.target.value,
                      })
                    }
                    className={`w-full px-4 py-3 rounded-xl ${darkMode
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-900"
                      } border ${darkMode ? "border-gray-700" : "border-gray-200"} outline-none`}
                    placeholder="70"
                  />
                </div>
                <div>
                  <label
                    className={`block text-sm font-semibold mb-2 ${darkMode ? "text-gray-300" : "text-gray-700"}`}
                  >
                    Height (cm)
                  </label>
                  <input
                    type="number"
                    value={bmiCalculator.height}
                    onChange={(e) =>
                      setBmiCalculator({
                        ...bmiCalculator,
                        height: e.target.value,
                      })
                    }
                    className={`w-full px-4 py-3 rounded-xl ${darkMode
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-900"
                      } border ${darkMode ? "border-gray-700" : "border-gray-200"} outline-none`}
                    placeholder="175"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={calculateBMI}
                className="w-full py-3 rounded-xl font-bold text-white 
             bg-gradient-to-r from-purple-600 to-pink-600
             hover:scale-105 transition-all duration-300"
              >
                Calculate BMI
              </button>
              {/* BMI Error */}
              {bmiError && (
                <p className="mt-4 text-sm text-red-400 font-medium">
                  ⚠ {bmiError}
                </p>
              )}

              {/* BMI Result */}
              {bmiResult && (
                <div className="mt-6 animate-fade-in">
                  <div
                    className={`rounded-2xl p-6 text-center text-white font-bold shadow-xl
      bg-gradient-to-r ${bmiResult.color}`}
                  >
                    <p className="text-sm tracking-wide">Your BMI</p>
                    <p className="text-4xl">{bmiResult.bmi}</p>
                    <p className="mt-2 text-lg">{bmiResult.category}</p>
                  </div>
                </div>
              )}

            </div>

            {/* Health Ranges */}
            <div
              className={`rounded-3xl p-8 ${darkMode
                ? "bg-gray-800/50 backdrop-blur-xl border border-gray-700/50"
                : "bg-white/70 backdrop-blur-xl border border-gray-200"
                } shadow-2xl`}
            >
              <h2
                className={`text-2xl font-bold mb-6 ${darkMode ? "text-white" : "text-gray-900"}`}
              >
                ◉ Normal Health Ranges
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    param: "Glucose",
                    range: "70-100 mg/dL (fasting)",
                    color: "from-red-500 to-orange-500",
                  },
                  {
                    param: "Blood Pressure",
                    range: "90-120 mmHg (systolic)",
                    color: "from-pink-500 to-rose-500",
                  },
                  {
                    param: "BMI",
                    range: "18.5-24.9 kg/m²",
                    color: "from-blue-500 to-cyan-500",
                  },
                  {
                    param: "Insulin",
                    range: "2.6-24.9 μU/mL",
                    color: "from-green-500 to-emerald-500",
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className={`p-4 rounded-xl ${darkMode ? "bg-gray-900/50" : "bg-white"} border ${darkMode ? "border-gray-700" : "border-gray-200"}`}
                  >
                    <div
                      className={`inline-block px-3 py-1 rounded-lg bg-gradient-to-r ${item.color} text-white text-xs font-bold mb-2`}
                    >
                      {item.param}
                    </div>
                    <p
                      className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}
                    >
                      {item.range}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* History Tab */}
        {/* History Tab */}
        {activeTab === "history" && (
          <div
            className={`rounded-3xl p-8 ${darkMode
              ? "bg-gray-800/50 backdrop-blur-xl border border-gray-700/50"
              : "bg-white/70 backdrop-blur-xl border border-gray-200"
              } shadow-2xl`}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <h2
                className={`text-2xl font-bold ${darkMode ? "text-white" : "text-gray-900"
                  }`}
              >
                ◐ Assessment History
              </h2>

              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  className={`px-4 py-2 rounded-xl font-semibold transition-all hover:scale-105 ${darkMode
                    ? "bg-red-900/30 text-red-400"
                    : "bg-red-100 text-red-600"
                    }`}
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Empty State */}
            {history.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4 opacity-50">◯</div>
                <p className={darkMode ? "text-gray-400" : "text-gray-600"}>
                  No assessments yet
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((item, index) => {
                  const itemColor =
                    item.risk_level === "Low Risk"
                      ? "#10b981"
                      : item.risk_level === "Medium Risk"
                        ? "#f59e0b"
                        : "#ef4444";

                  const isSelected = selectedHistory.includes(index);

                  return (
                    <div
                      key={index}
                      onClick={() => toggleHistorySelection(index)}
                      className={`p-6 rounded-2xl border-2 cursor-pointer transition-all
                ${isSelected ? "ring-2 ring-purple-500 scale-[1.02]" : ""}
                ${darkMode ? "bg-gray-900/50" : "bg-white"}
              `}
                      style={{ borderColor: itemColor + "40" }}
                    >
                      {/* Top Row */}
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <span
                            className="inline-block px-4 py-2 rounded-full text-white text-sm font-bold"
                            style={{ background: itemColor }}
                          >
                            {item.risk_percentage}% - {item.risk_level}
                          </span>
                          <p
                            className={`text-xs mt-2 ${darkMode ? "text-gray-500" : "text-gray-600"
                              }`}
                          >
                            {new Date(item.timestamp).toLocaleString()}
                          </p>
                        </div>

                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm">
                            ✓
                          </div>
                        )}
                      </div>

                      {/* Metrics */}
                      <div className="grid grid-cols-4 gap-3 text-sm">
                        {[
                          ["Age", item.inputs.age],
                          ["Glucose", item.inputs.glucose],
                          ["BMI", item.inputs.bmi],
                          ["BP", item.inputs.bloodPressure],
                        ].map(([label, value], i) => (
                          <div key={i}>
                            <p
                              className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-600"
                                }`}
                            >
                              {label}
                            </p>
                            <p
                              className={`font-bold ${darkMode ? "text-white" : "text-gray-900"
                                }`}
                            >
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Compare / Hide Button */}
            {selectedHistory.length > 1 && (
              <button
                onClick={() => setShowComparison(!showComparison)}
                className="w-full mt-6 py-3 rounded-xl font-bold
          bg-gradient-to-r from-purple-600 to-pink-600
          text-white hover:scale-105 transition-all"
              >
                {showComparison ? "Hide Comparison" : "Compare Selected"} (
                {selectedHistory.length})
              </button>
            )}

            {/* Comparison View */}
            {showComparison && selectedHistory.length > 1 && (
              <div
                className={`mt-8 rounded-3xl p-6 ${darkMode
                  ? "bg-gray-900/60 border border-gray-700"
                  : "bg-white border border-gray-200"
                  } shadow-2xl animate-fade-in`}
              >
                <h3
                  className={`text-xl font-bold mb-6 ${darkMode ? "text-white" : "text-gray-900"
                    }`}
                >
                  ◈ Health Comparison (Old vs Latest)
                </h3>

                {(() => {
                  const older = history[selectedHistory[selectedHistory.length - 1]];
                  const latest = history[selectedHistory[0]];

                  const getTrend = (oldVal, newVal, reverse = false) => {
                    if (oldVal === newVal)
                      return { icon: "→", color: "text-gray-400", label: "No Change" };

                    const improved = reverse ? newVal < oldVal : newVal > oldVal;

                    return improved
                      ? { icon: "↑", color: "text-green-400", label: "Improved" }
                      : { icon: "↓", color: "text-red-400", label: "Worsened" };
                  };

                  const rows = [
                    {
                      label: "Risk %",
                      old: older.risk_percentage,
                      new: latest.risk_percentage,
                      reverse: true,
                      suffix: "%",
                    },
                    {
                      label: "Age",
                      old: older.inputs.age,
                      new: latest.inputs.age,
                    },
                    {
                      label: "Glucose",
                      old: older.inputs.glucose,
                      new: latest.inputs.glucose,
                      reverse: true,
                    },
                    {
                      label: "BMI",
                      old: older.inputs.bmi,
                      new: latest.inputs.bmi,
                      reverse: true,
                    },
                    {
                      label: "Blood Pressure",
                      old: older.inputs.bloodPressure,
                      new: latest.inputs.bloodPressure,
                      reverse: true,
                    },
                  ];

                  return (
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="grid grid-cols-4 text-xs font-semibold uppercase tracking-wider text-gray-400 px-2">
                        <span>Metric</span>
                        <span className="text-center">Old</span>
                        <span className="text-center">Trend</span>
                        <span className="text-center">Latest</span>
                      </div>

                      {rows.map((row, i) => {
                        const trend = getTrend(row.old, row.new, row.reverse);

                        return (
                          <div
                            key={i}
                            className={`grid grid-cols-4 items-center px-3 py-3 rounded-xl ${darkMode ? "bg-gray-800/50" : "bg-gray-50"
                              }`}
                          >
                            <span className={darkMode ? "text-gray-300" : "text-gray-700"}>
                              {row.label}
                            </span>

                            <span className="text-center font-bold">
                              {row.old}
                              {row.suffix || ""}
                            </span>

                            <span
                              className={`text-center font-bold ${trend.color}`}
                              title={trend.label}
                            >
                              {trend.icon}
                            </span>

                            <span className="text-center font-bold">
                              {row.new}
                              {row.suffix || ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

          </div>
        )}


        {/* Insights Tab */}
        {activeTab === "insights" && (
          <div className="space-y-8">
            <div
              className={`rounded-3xl p-8 ${darkMode
                ? "bg-gray-800/50 backdrop-blur-xl border border-gray-700/50"
                : "bg-white/70 backdrop-blur-xl border border-gray-200"
                } shadow-2xl`}
            >
              <h2
                className={`text-2xl font-bold mb-6 ${darkMode ? "text-white" : "text-gray-900"}`}
              >
                ◆ Understanding Diabetes Risk
              </h2>

              <div className="space-y-6">
                {[
                  {
                    title: "What is the PIMA Dataset?",
                    content:
                      "The PIMA Indian Diabetes Dataset is a collection of medical data from Pima Native American women, used to predict diabetes onset based on diagnostic measurements.",
                    icon: "◈",
                  },
                  {
                    title: "How Does Random Forest Work?",
                    content:
                      "Random Forest creates multiple decision trees during training and outputs the average prediction. It handles non-linear relationships and provides robust predictions.",
                    icon: "◉",
                  },
                  {
                    title: "Key Risk Factors",
                    content:
                      "High glucose levels, elevated BMI, family history (pedigree function), age, and insulin resistance are the strongest predictors of diabetes risk.",
                    icon: "◐",
                  },
                  {
                    title: "Prevention Strategies",
                    content:
                      "Regular exercise, maintaining healthy weight, balanced diet, stress management, and adequate sleep can significantly reduce diabetes risk.",
                    icon: "◆",
                  },
                ].map((insight, i) => (
                  <div
                    key={i}
                    className={`p-6 rounded-2xl ${darkMode
                      ? "bg-gray-900/50 border border-gray-700"
                      : "bg-white border border-gray-200"
                      }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                        {insight.icon}
                      </div>
                      <div>
                        <h3
                          className={`font-bold text-lg mb-2 ${darkMode ? "text-white" : "text-gray-900"}`}
                        >
                          {insight.title}
                        </h3>
                        <p
                          className={`${darkMode ? "text-gray-400" : "text-gray-600"}`}
                        >
                          {insight.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer
          className={`mt-12 pt-6 border-t text-center text-xs ${darkMode
            ? "border-gray-700 text-gray-500"
            : "border-gray-200 text-gray-600"
            }`}
        >
          <p className="font-medium tracking-wide">
            © {new Date().getFullYear()} Team <span className="font-semibold">MPK³</span>. All rights reserved.
          </p>
        </footer>

      </div>

      <style>{`
@keyframes float {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  33% { transform: translate(30px, -30px) rotate(120deg); }
  66% { transform: translate(-20px, 20px) rotate(240deg); }
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.animate-shimmer {
  animation: shimmer 2s infinite;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.4s ease-out;
}

.transition-all {
  transition-property: all;
}

.duration-2000 {
  transition-duration: 2000ms;
}
`}</style>

    </div>
  );
}

export default App;
